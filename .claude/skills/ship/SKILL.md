---
name: ship
description: Commit and push ImageLab changes to main, which deploys the site to GitHub Pages, then confirm the deploy. Use whenever the user says to commit, push, ship, deploy or release.
---

# Shipping ImageLab

A push to `main` deploys https://giacoct.github.io/ImageLab/ (workflow
`.github/workflows/pages.yml`). `main` is the only branch.

1. **Check.** `npm run check` must pass (formatting, types, every test). Fix
   failures; don't ship around them.
2. **Review.** `git status` and `git diff`: only intended changes, no stray
   files (screenshots, `dist/`), docs updated with the code.
3. **Commit.** Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`,
   `ci:`, `chore:`), one per coherent change: split unrelated work into
   separate commits. A breaking change gets `!` and a `BREAKING CHANGE:`
   footer. The body says what changed for the user and why, not a file
   list. End with the Co-Authored-By line.
4. **Push.** `git push origin main`. Never force-push.
5. **Watch the deploy.** `gh run list --branch main --limit 1`, then
   `gh run watch <id> --exit-status`. If it fails, read
   `gh run view <id> --log-failed`, fix, and ship again.
6. **Confirm it's live.** The page at https://giacoct.github.io/ImageLab/
   references the new `assets/index-*.js` (compare with `dist/index.html`
   from `npm run build`).

Report the commit hashes, the run's result and the live URL.
