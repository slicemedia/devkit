export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, readonly string[]>;
}

const booleanOptions = new Set(["git-history", "help", "json", "yes", "sourcemap", "hmr"]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === undefined) continue;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const equalsAt = value.indexOf("=");
    const key = value.slice(2, equalsAt === -1 ? undefined : equalsAt);
    const inlineValue = equalsAt === -1 ? undefined : value.slice(equalsAt + 1);
    const next = argv[index + 1];
    const optionValue =
      inlineValue ??
      (!booleanOptions.has(key) && next !== undefined && !next.startsWith("--") ? next : "true");
    if (inlineValue === undefined && optionValue === next) index += 1;
    const values = options.get(key) ?? [];
    values.push(optionValue);
    options.set(key, values);
  }

  return { positionals, options };
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  const value = args.options.get(name)?.at(-1);
  return value !== undefined && value !== "false";
}

export function getOption(args: ParsedArgs, name: string): string | undefined {
  const value = args.options.get(name)?.at(-1);
  return value === "true" ? undefined : value;
}

export function getOptions(args: ParsedArgs, name: string): readonly string[] {
  return (args.options.get(name) ?? []).filter((value) => value !== "true");
}

export function getIntegerOption(args: ParsedArgs, name: string, fallback: number): number {
  const value = getOption(args, name);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  return parsed;
}
