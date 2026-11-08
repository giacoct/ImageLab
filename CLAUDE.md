# ImageLab

Image tools that chain without limit, running entirely in the browser: a static
Svelte 5 + TypeScript site on GitHub Pages, no backend. What it does is in
`README.md`; how it's built is below (`docs/architecture.md`).

## Commands

```bash
npm run dev       # http://localhost:4200
npm run check     # prettier --check, svelte-check, all tests: run after every change
npm run build     # svelte-check + vite build → dist/
npx vitest run --project unit      # pure tests (src/core), Node, fast
npx vitest run --project browser   # engine tests (src/engine), headless Chromium
npm run format    # prettier --write .
```

## Rules

- **Commit and push when told to.** "Commit" means: `npm run check` passes,
  commit, `git push origin main`, then watch the deploy (`/ship`). Without the
  instruction, don't commit.
- **One branch: `main`.** No other long-lived branches; a push to `main`
  deploys to https://giacoct.github.io/ImageLab/.
- **Conventional commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `ci:`…),
  one per coherent change, ending with the Co-Authored-By line.
- **Feature-oriented.** Every tool is a step (`src/ops/`); to add one, follow
  `/new-tool`. Prefer the simplest design that is reliable, efficient and
  pleasant to use; keep the code small and proportionate.
- **Check UI changes in a real browser** (`/try-it`), not only with tests.
- **Keep `README.md` and `docs/architecture.md` in step** with the code, in
  the same commit.
- **Latest stable dependencies, pinned exactly** (`npm install --save-exact`).
  TypeScript stays on 6 until `svelte-check` supports 7.

@docs/architecture.md
