# Importing 100 Steps to Life into GitHub

This archive contains the application source code only. It excludes dependencies, build output, local Git metadata, local environment files, and development logs.

## In a GitHub Codespace

Upload this ZIP file to the root of your cloned `100-Steps-to-Life` repository, then run:

```bash
unzip 100-Steps-to-Life-source.zip -d .
rm 100-Steps-to-Life-source.zip
pnpm install
pnpm test
pnpm build
git add .
git commit -m "Import Hundred Steps to Life"
git push origin main
```

The app needs Node.js 22 and pnpm. Its Manus authentication, database, and storage variables are platform-provided in the hosted project; create your own environment configuration before deploying elsewhere.
