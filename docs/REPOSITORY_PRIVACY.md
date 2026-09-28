# Public repository and private local configuration

The public project contains application source, migrations, tests, dependency manifests, OpenAPI, sanitized evidence and documentation. The `.env.example` and Azure app-settings example contain development fixtures/placeholders only. Real cloud/API credentials are supplied privately.

## Private local files

Local `.env` and `.env.azure*` files, Azure CLI/session data, `private/` and `secrets/`, signing keys/certificates and publishing profiles are excluded by Git and Docker. Existing local environment files have mode 0600. VS Code hides local credentials and generated folders while retaining the public templates in Explorer. Hiding files is a navigation aid; Git exclusions and file permissions provide the publishing boundary.

Generated `dist/`, `artifacts/`, coverage and installed `node_modules/` are not versioned. Build recreates `dist/`; release staging recreates `artifacts/`. Old generated releases were removed during organization. Installed dependencies are retained for development.

## Before pushing

```sh
npm run check:public
git status --short
```

The public-file check inspects tracked paths and common credential formats without printing matched values. CI repeats it after checkout. It is a focused guard, not a guarantee that every possible secret format will be detected. Review new environment/configuration files and sanitize evidence before committing.

Before the cleanup push, local private values are also compared against the files and historical Git blobs that will be published. Public development fixtures remain intentionally visible and clearly labelled. Previously committed history requires its own review: adding a file to `.gitignore` does not remove it from earlier commits.

Never paste private environment-file contents, access tokens, private passwords or Azure publishing profiles into issues, reports or public documentation. A GitHub repository may remain public or private according to the owner's settings; both require keeping real credentials out of Git.
