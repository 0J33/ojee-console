#!/usr/bin/env bash
# Refresh the vendored copy of ojee-ui.
#
# ojee-ui is its own repo and its own release cycle. The console vendors a
# copy rather than fetching it at runtime so the shell has no external
# dependency at boot — a design system that fails to load leaves an unstyled
# login form, which is exactly when you least want one.
#
#   bash scripts/sync-ui.sh [path-to-ojee-ui]     # default: ../ojee-ui
set -euo pipefail
SRC="${1:-$(cd "$(dirname "$0")/../../ojee-ui" && pwd)}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public"

[ -f "$SRC/ojee-ui.css" ] || { echo "no ojee-ui.css in $SRC" >&2; exit 1; }

cp "$SRC/ojee-ui.css" "$DEST/ojee-ui.css"
# chrome.js is the interactive half of the design system — toast, modal, the
# scoped api/sse pair and ModuleHost. The console shell and every module's
# standalone shell run the SAME file, which is the only reason standalone mode
# is real rather than a per-module reimplementation.
cp "$SRC/chrome.js" "$DEST/chrome.js"
mkdir -p "$DEST/themes"
for f in "$SRC"/themes/*.css; do
  case "$(basename "$f")" in _template.css) continue ;; esac
  cp "$f" "$DEST/themes/"
done
printf 'synced ojee-ui from %s\n' "$SRC"
grep -m1 'OJEE-UI v' "$DEST/ojee-ui.css" || true
