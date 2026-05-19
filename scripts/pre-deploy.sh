#!/usr/bin/env bash
# scripts/pre-deploy.sh
# Run before every push. Stops on type errors; warns on noise we want to track.

set -u
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cd "$(dirname "$0")/.." || exit 1

echo "─── 1. TypeScript ───────────────────────────────"
if ! npx tsc --noEmit; then
  echo -e "${RED}✗ Type check failed. Fix before pushing.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ tsc clean${NC}"
echo

echo "─── 2. console.log statements (warning) ──────────"
LOG_HITS=$(grep -rn "console.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." || true)
LOG_COUNT=$(echo -n "$LOG_HITS" | grep -c . || true)
if [ "$LOG_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}! $LOG_COUNT console.log calls (showing first 20):${NC}"
  echo "$LOG_HITS" | head -20
else
  echo -e "${GREEN}✓ no console.log calls${NC}"
fi
echo

echo "─── 3. 'as any' count ────────────────────────────"
AS_ANY_COUNT=$(grep -rn "as any" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "  $AS_ANY_COUNT occurrences (track over time)"
echo

echo "─── 4. TODO / FIXME / HACK comments ──────────────"
TODO_COUNT=$(grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "  $TODO_COUNT occurrences"
echo

echo -e "${GREEN}─── pre-deploy checks done ──────────────────────${NC}"
echo "If output looks fine, push with: git push"
