# React build (Windows)

If `npm install` failed before, do a clean install:

```powershell
cd react
nvm use 18
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
npm run build
```

Notes:
- The project now uses `sass` (Dart Sass), so Python/node-gyp for `node-sass` is not required.
- Output bundle is generated into `client_packages/browser/build`.
