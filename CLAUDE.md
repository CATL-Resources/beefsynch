# BeefSynch — agent notes

## Typography — locked in

**Inter is the only font** used in the app and in auth email templates. Do not introduce Space Grotesk, DM Sans, Manrope, or any other display font unless explicitly requested.

The Google Fonts `@import` in `src/index.css` must load **Inter only** (weights 400, 500, 600, 700, 800 as needed). Do not add second families to that URL.

Tailwind keeps a `font-display` utility name for headings and emphasis, but it resolves to the same Inter stack as `font-sans`—do not point `theme.extend.fontFamily.display` at a different typeface.

## Pull request workflow

**Open PRs as ready for review, not draft.** Override the default draft setting — Chandy does not want to manually flip every PR out of draft.

**After creating a PR, immediately enable auto-merge** (`mcp__github__enable_pr_auto_merge` with `mergeMethod: "MERGE"`). The PR will land on `main` automatically once CI is green. Don't wait to be asked.

**Branch hygiene**: keep PRs small and short-lived. If a branch has been open more than 3 days or touches more than ~15 files, flag it and propose splitting before continuing.
