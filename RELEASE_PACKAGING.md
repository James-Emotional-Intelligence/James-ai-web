# Release Packaging

Do not compress the project root (`D:\website\jami ai`). It can contain development secrets, dependencies, source control data, and local material storage.

Create the shareable artifact only with:

```powershell
npm run release:archive
```

The command packages only `dist/release-package`, verifies the extracted ZIP, and writes the archive to `release-artifacts`.
