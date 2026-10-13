# Repository integration

**Goal:** Commit, push and merge the existing work, then remove redundant local branches and worktrees.

**Authority:** The user's instruction on 2026-10-13: "commit push and merge anything that wasn't till now."

## Integration decisions

- Preserve the newer local `main` snapshot (`6792a6d`) while joining the rewritten GitHub `main` history (`81f1fb8`). The local snapshot already includes the remote's import notes, avatars, business types and earlier card behavior, followed by the colour redesign, exact import readers, kind filtering and Vercel previews.
- Merge phase 3 screens, research, parked bank connections and import designs, and the card compatibility and menu fixes. These commits contain existing implementation and documentation; planned future features remain plans.
- Join the older colour, import and task histories already absorbed by squash or equivalent patches. Keep their newer replacements rather than replaying obsolete UI implementations.
- Commit the card sheets, category hue controls and fidelity changes found in three dirty worktrees. Their commits are `66fb6bc`, `96ae7df` and `af66faa`.
- Preserve the stash. Its shell implementation is already represented or superseded by phase 3.
- Track the existing project `AGENTS.md`. Keep machine-local tool configuration and credentials local.

## Integration repairs

- Choose category deletion targets from the deleted category's kind, including when both desktop sheets are visible. Keep the kind selector available so desktop users can add income categories.
- Calculate card bills for the selected month, with charge status relative to today, including an archived card's final bill charged on day one. Show the current-month balance sentence only for the current month.
- Paste incidental query and amount input in form tests. Allow DOM interaction tests 15 seconds under parallel coverage; behavioral assertions remain intact.

## Checks and cleanup

- [x] Back up all original Git refs in a verified bundle under `.git/repo-cleanup/` before cleanup.
- [x] Preserve the removed Vercel worktree's local settings and residual files in that backup directory.
- [x] Reproduce income-category deletion and selected-month bill failures with regression tests.
- [x] Run focused tests after the repairs: 59 tests passed across four files.

1. Run `pnpm verify` against the final combined tree and resolve failures.
2. Push and merge with normal Git history updates, then verify local and remote `main` agree.
3. Remove branches reachable from the merged `main` with `git branch -d`, and retire their clean worktrees while preserving local settings.

The original branches, worktree paths and heads are recorded beside the bundle. Backups and credentials are not committed.
