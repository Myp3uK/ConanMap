# Build script for Windows PowerShell (alternative to build.sh)
# Run from project root: .\bin\build.ps1

$ErrorActionPreference = "Stop"

$version = (Get-Content package.json | ConvertFrom-Json).version

Write-Host "Building conan-exiles-admin-map v$version..."

# Clean
if (Test-Path lib)   { Remove-Item -Recurse -Force lib }
if (Test-Path build) { Remove-Item -Recurse -Force build }

# Transpile src -> lib
npx babel src --out-dir lib
if (-not $?) { throw "Babel transpile failed" }

# Copy EJS views (babel ignores non-JS files)
Copy-Item -Recurse src\views lib\views

# Bundle to .exe
npx pkg lib\conan-exiles-admin-map.js -t latest-win-x64 --out-path build -c package.json
if (-not $?) { throw "pkg bundling failed" }

# Rename exe
Rename-Item build\conan-exiles-admin-map-win.exe build\conan-exiles-admin-map.exe

# Copy runtime files
Copy-Item src\conan-exiles-admin-map.ini build\
Copy-Item node_modules\better-sqlite3\build\Release\better_sqlite3.node build\

# Remove intermediate lib
Remove-Item -Recurse -Force lib

# Zip
Compress-Archive -Path build\* -DestinationPath "build\conan-exiles-admin-map-v$version.zip" -Force

Write-Host ""
Write-Host "Done: build\conan-exiles-admin-map-v$version.zip"
