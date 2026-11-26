#!/usr/bin/env bash
# Refresh the vendored copy of ojee-ui v3.
#
# ojee-ui is its own repo and its own release cycle. The console vendors a
# copy rather than fetching it at runtime so the shell has no external
# dependency at boot — a design system that fails to load leaves an unstyled
# login form, which is exactly when you least want one.
#
#   bash scripts/sync-ui.sh [path-to-ojee-ui]     # default: ../ojee-ui
#
# Copies ojee-ui3.css, ojee-ui3.js and fonts/, and inlines icons3.svg into
# public/index.html between the <!-- ui3-sprite --> markers (icons are
# <use href="#i-…">, which needs the sprite in the page). chrome.js is NOT
# copied: the console's copy carries shell-side fixes; diff it by hand.
set -euo pipefail
SRC="${1:-$(cd "$(dirname "$0")/../../ojee-ui" && pwd)}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public"

[ -f "$SRC/ojee-ui3.css" ] || { echo "no ojee-ui3.css in $SRC" >&2; exit 1; }
cp "$SRC/ojee-ui3.css" "$SRC/ojee-ui3.js" "$DEST/"
mkdir -p "$DEST/fonts"
cp "$SRC"/fonts/*.woff2 "$SRC"/fonts/OFL-Geist.txt "$DEST/fonts/"
python3 - "$SRC/icons3.svg" "$DEST/index.html" <<'PY'
import sys, re
sprite = open(sys.argv[1]).read().strip()
sprite = re.sub(r'<!--.*?-->\n?', '', sprite, flags=re.S)
p = sys.argv[2]
s = open(p).read()
s2 = re.sub(r'(<!-- ui3-sprite -->).*?(<!-- /ui3-sprite -->)', lambda m: m.group(1) + '\n' + sprite + '\n' + m.group(2), s, flags=re.S)
open(p, 'w').write(s2)
PY
printf 'synced ojee-ui v3 from %s\n' "$SRC"
