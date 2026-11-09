#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
bundle=$(mktemp -d "$PWD/harold.XXXXXXXX")
trap 'rm -rf -- "$bundle"' EXIT
mkdir "$bundle/site"
COPYFILE_DISABLE=1 /usr/bin/rsync -r --exclude='*.glb.gz' site/ "$bundle/site/"
# Take only the already published site files, never the dirty working tree.
hub="$HOME/projects/ourcampus-work"
git -C "$hub" archive c82358a worldwide-stages-existing-campus worldwide-stages-six-options | tar -x -C "$bundle/site"
mv "$bundle/site/worldwide-stages-six-options" "$bundle/site/worldwide-stages-options"
mkdir "$bundle/site/worldwide-stages"
cat > "$bundle/site/worldwide-stages/index.html" <<'HTML'
<!doctype html><html lang="en"><meta charset="utf-8"><title>Worldwide Stages · Existing campus</title>
<meta http-equiv="refresh" content="0;url=../worldwide-stages-existing-campus/Viewer/">
<a href="../worldwide-stages-existing-campus/Viewer/">Open the existing campus</a>
HTML
cp deploy/{install-harold.sh,httpd.conf.in} "$bundle/"
(cd "$bundle"; find site -type f -print0 | xargs -0 /usr/bin/shasum -a 256 > site.sha256)
COPYFILE_DISABLE=1 tar -czf harold-site-release.tar.gz -C "$bundle" .
shasum -a 256 harold-site-release.tar.gz > proof/harold-archive.sha256
