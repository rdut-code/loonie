#!/bin/sh
# Publishes the app to GitHub Pages.
# Runs the tests, builds the site, and pushes the built files to the
# "gh-pages" branch. If a test fails, nothing is published.
set -e
cd "$(dirname "$0")/.."

npm test
npm run build

REMOTE=$(git remote get-url origin)
NAME=$(git config user.name)
EMAIL=$(git config user.email)
VERSION=$(git rev-parse --short HEAD)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cp -R dist/. "$WORK/"
# Tells GitHub Pages to serve the files as they are.
touch "$WORK/.nojekyll"

cd "$WORK"
git init -q -b gh-pages
git config user.name "$NAME"
git config user.email "$EMAIL"
git add -A
git commit -q -m "Publish $VERSION"
git push -q --force "$REMOTE" gh-pages
echo "Published version $VERSION."
