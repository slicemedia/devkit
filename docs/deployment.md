# Deploying addon and vendor files

Run the project typecheck and default build, then deploy the complete `dist/` directory with its
relative paths intact. This applies to DigitalOcean Spaces, another host, or a GitHub Action that
uploads a directory. The build is provider-independent:

```text
dist/addons/<name>.js        # select only the needed addon tags on each page
dist/addons/<name>.css       # only when emitted; place this CSS in the head
dist/addons/animations/counter.js  # categories from marked source entries are preserved
dist/addons/sliders/gallery/index.js  # an addon can retain its own output folder
dist/projects/<name>.js      # optional, deliberately composed project behavior
dist/vendor/<name>.js        # shared dependencies loaded on demand by addons
dist/vendor/<name>.css       # shared CSS loaded by the dependency loader
dist/webflow-scripts.json    # actual entry and vendor file paths
```

Nested `*.entry.ts` / `*.entry.js` sources retain their relative folders in `dist/`; the `.entry`
marker is removed from public filenames. The optional Spaces Deployer and recursive directory
uploads in GitHub Actions preserve these paths. For example, `dist/addons/animations/counter.js`
is served at `<asset-base>/addons/animations/counter.js`. Do not flatten files when uploading or
copy only the first level. Shared vendor URLs are calculated by the build for every folder depth.
Moving an entry to another category changes its URL; deploy the build and update affected embeds
together. See [entry conventions](standalone-builds.md).

Add `--sourcemap` to the build when private JavaScript maps are needed. They are written only under
`.slicemedia/sourcemaps/`, outside `dist/`, with no public map references. Uploading `dist/` does
not expose those maps. The JavaScript delivered to a browser itself remains inspectable.

Generate `explain` or `catalog --manifest dist/webflow-scripts.json` after building. CSS tags are
generated only for files listed in the build manifest and present on disk. Catalog enrichment
preserves the actual build paths and vendor list. Use `--out-dir` when documenting a custom build
directory. Replace development/HMR tags with the selected production addon tags after deployment.

## Optional Spaces Deployer

`@slicemedia/spaces-deployer` is independent and optional. Its stable mode keeps URLs such as
`<asset-base>/addons/counter.js` and `<asset-base>/vendor/animations.js`. The release label is for
auditing; it does not change those URLs. Review a plan for all of `dist/`, an explicit endpoint,
region, bucket, dedicated prefix, CDN endpoint ID, and public browser delivery (`acl: "public-read"`
or independently configured access). The CLI default is stable mode; the generated integration
sets it explicitly.

Apply replaces only the planned changed keys, verifies uploaded/current objects, and requests a
CDN cache purge scoped to that prefix. Bucket versioning is optional from Deployer 0.2.1 onward;
`--require-bucket-versioning` makes it an explicit project requirement. Without enabled versioning,
overwriting does not preserve prior bytes. After partial failure, inspect the receipt: reapplying
the same unchanged, approved stable plan skips matching uploads and retries the purge. Source or
target changes require a new plan. The deployer never deletes obsolete remote files.

Stable cache headers revalidate browsers and allow short shared-cache retention. Verify public
response headers and JavaScript/CSS delivery. Serialize CI deployments to the same prefix: uploads
of multiple files are not atomic. Keep matching addon/vendor build artifacts for rollback. An
already open page retains its loaded APIs until reload; a CDN purge does not replace live objects.

Immutable mode remains available when a project needs URLs bound to exact bytes. It uses a
release/digest namespace and immutable caching, with no CDN purge. Webflow's hosted-script
registration API requires a version and integrity hash, so use byte-bound URLs for that workflow.
Reviewed freeform script embeds can use stable URLs. A fixed integrity hash cannot keep validating
a file whose contents change. See the [Webflow registration contract](https://developers.webflow.com/data/reference/custom-code/custom-code/register-hosted).

The [Spaces Deployer documentation](https://github.com/slicemedia/spaces-deployer#readme) owns the
exact CLI options, plan review/apply workflow, and deployment receipts. Uploading artifacts does
not edit or publish Webflow pages.
