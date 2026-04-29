# React build (Windows)

## 1) Где запускать команды
Запускайте команды из папки `ServFinall\react`.

Если `pwd`/`Get-Location` уже показывает `...\react`, **не делайте повторно** `cd react`.

## 2) Node.js
- Рекомендуется Node 18 LTS.
- Если `nvm` не установлен — это нормально, просто поставьте Node 18 вручную и откройте новый PowerShell.

Проверка:

```powershell
node -v
npm -v
```

## 3) Чистая установка и сборка

```powershell
# Вы уже в папке react
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
npm run build
npm run build:verify-marketplace
```

## 4) Что важно
- Проект использует `sass` (Dart Sass), поэтому Python/node-gyp для `node-sass` не нужен.
- Итоговый бандл лежит в `client_packages/browser/build`.
- Команда `npm run build:verify-marketplace` проверит, что в собранном бандле есть маркеры маркетплейса.

## 5) Если всё ещё есть ошибка OpenSSL
Для старых webpack-цепочек можно добавить fallback:

```powershell
$env:NODE_OPTIONS="--openssl-legacy-provider"
npm run build
```
