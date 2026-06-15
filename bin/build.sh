#!/usr/bin/env bash

PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",\t ]//g')

rm -rf lib build
babel src --out-dir lib
cp -rf src/views lib/views
npx --yes @yao-pkg/pkg lib/conan-exiles-admin-map.js -t node24-win-x64 --out-path build -c package.json
rm -rf lib
cd build
cp ../src/conan-exiles-admin-map.ini .
if command -v zip &>/dev/null; then
  zip -r "conan-exiles-admin-map-v${PACKAGE_VERSION}.zip" .
else
  powershell -Command "Compress-Archive -Path * -DestinationPath conan-exiles-admin-map-v${PACKAGE_VERSION}.zip -Force"
fi
cd ..
