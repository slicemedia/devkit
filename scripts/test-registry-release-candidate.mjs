import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryPrefix = "slicemedia-devkit-registry-candidate-";
const products = [
  ["agentKit", "--agent-kit-tarball"],
  ["swiperAdapter", "--swiper-adapter-tarball"],
  ["spacesDeployer", "--spaces-deployer-tarball"],
];

function execute(command, arguments_, options = {}) {
  return new Promise((resolveExecution, rejectExecution) => {
    const child = execFile(command, arguments_, {
      cwd: options.cwd ?? workspaceRoot,
      encoding: "utf8",
      maxBuffer: 24 * 1024 * 1024,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      if (options.inherit === true) process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (options.inherit === true) process.stderr.write(chunk);
    });
    child.on("error", rejectExecution);
    child.on("close", (code) => {
      if (code === 0) resolveExecution({ stdout, stderr });
      else rejectExecution(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function main() {
  const configuration = JSON.parse(
    await readFile(resolve(workspaceRoot, "config/external-products.json"), "utf8"),
  );
  const canonicalTemporaryDirectory = await realpath(tmpdir());
  const temporaryRoot = await mkdtemp(join(canonicalTemporaryDirectory, temporaryPrefix));
  if (
    dirname(temporaryRoot) !== canonicalTemporaryDirectory ||
    !basename(temporaryRoot).startsWith(temporaryPrefix)
  ) {
    throw new Error(`Refusing to use unsafe temporary path: ${temporaryRoot}`);
  }
  try {
    const candidateArguments = [
      resolve(workspaceRoot, "scripts/test-packed-consumer.mjs"),
      "--full-family",
    ];
    for (const [key, option] of products) {
      const product = configuration.products[key];
      if (product?.range?.startsWith("^") !== true) {
        throw new Error(`External product ${key} must use an explicit caret range.`);
      }
      const version = product.range.slice(1);
      const { stdout } = await execute(
        "npm",
        [
          "pack",
          `${product.packageName}@${version}`,
          "--pack-destination",
          temporaryRoot,
          "--json",
        ],
        { cwd: temporaryRoot },
      );
      const packed = JSON.parse(stdout);
      const filename = packed?.[0]?.filename;
      if (typeof filename !== "string") {
        throw new Error(`npm did not return an archive for ${product.packageName}@${version}.`);
      }
      const archive = resolve(temporaryRoot, basename(filename));
      if ((await stat(archive)).isFile() !== true) throw new Error(`Missing archive: ${archive}`);
      candidateArguments.push(option, archive);
    }
    await execute(process.execPath, candidateArguments, { inherit: true });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

await main();
