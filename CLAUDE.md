# ImageLab

Image tools whose results can be downloaded or used as the input of another tool, running entirely in the browser: a static Svelte 5 + TypeScript site on GitHub Pages, no backend. What it does is in `README.md`; how it's built is below (`docs/architecture.md`).

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

- Always commit, push when told to. "Commit" means: `npm run check` passes commit. "Push" means `git push origin main`, then watch the deploy (`/ship`).
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `ci:`, ...), one per coherent change.
- Feature-oriented: tools are the core of ImageLab, prefer a simple and clean design that is reliable, efficient and pleasant to use.
- Check UI changes in a real browser, not only with tests.
- Keep `README.md` and `CLAUDE.md` in step with the code, in the same commit.
