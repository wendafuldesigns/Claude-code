#!/usr/bin/env bash
# Builds the folder buyers get: dist/Paper-Trail-Kit/ and a zip next to it.
#
#   ./make-kit.sh --draft   build with a -DRAFT zip name (use while testing)
#   ./make-kit.sh           final build; refuses to run until every REVIEW-BEFORE-SELLING line is gone
#
# The app itself is ../paper-trail.html. It is copied as is. Everything else comes from buyer/.
# The folder a buyer opens has three files (START-HERE.html, CLAUDE.md, paper-trail.html) and a more/ folder.
set -euo pipefail
cd "$(dirname "$0")"

MODE=final
[ "${1:-}" = "--draft" ] && MODE=draft
VERSION="$(tr -d '[:space:]' < VERSION)"
APP=../paper-trail.html
SUFFIX=""
[ "$MODE" = draft ] && SUFFIX="-DRAFT"

fail() { echo "STOP: $*" >&2; exit 1; }

[ -f "$APP" ] || fail "can't find $APP"
grep -q '<title>Paper Trail</title>' "$APP" || fail "$APP does not look like Paper Trail"

# the app and the guides never name a specific model
if grep -rn -i -E 'claude-(opus|sonnet|haiku|fable)|sonnet|opus|haiku' "$APP" buyer >/dev/null; then
  grep -rn -i -E 'claude-(opus|sonnet|haiku|fable)|sonnet|opus|haiku' "$APP" buyer || true
  fail "a model name is in a buyer-facing file"
fi

# voice rule: no em dashes in anything buyers read
if grep -rn '—' buyer "$APP"; then fail "em dash found (see above)"; fi

# every placeholder must be resolved before a real sale
if [ "$MODE" = final ] && grep -rn 'REVIEW-BEFORE-SELLING' buyer; then
  fail "resolve the REVIEW-BEFORE-SELLING lines above, or build with --draft"
fi

OUT=dist/Paper-Trail-Kit
rm -rf dist/Paper-Trail-Kit dist/*.zip
mkdir -p "$OUT/more/screens"
cp "$APP" "$OUT/paper-trail.html"
cp buyer/START-HERE.html buyer/CLAUDE.md "$OUT/"
cp buyer/more/* "$OUT/more/"
cp screens/1-home.png screens/3-fields.png screens/4-summary.png screens/5-reminder.png "$OUT/more/screens/"

# stamp the version into the guides
for f in START-HERE.html more/GUIDE.html more/TERMS.txt; do
  sed -i "s/{{VERSION}}/$VERSION/g" "$OUT/$f"
done
grep -rn '{{' "$OUT" --include='*.html' --include='*.txt' --include='*.md' && fail "an unfilled {{placeholder}} is in the kit"

ZIP="Paper-Trail-Kit-v${VERSION}${SUFFIX}.zip"
( cd dist && zip -r -q "$ZIP" Paper-Trail-Kit )
echo "Built dist/$ZIP"
unzip -l "dist/$ZIP" | tail -n +4 | head -n -2
echo "App file sha256: $(sha256sum "$APP" | cut -d' ' -f1)"
