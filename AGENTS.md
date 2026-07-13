# AGENTS.md

This is a Bun-based TypeScript/Vite project.

## Commands

- Install dependencies: `bun install`
- Type-check and build: `bun run build`
- Run all tests: `bun test`
- Run one test file: `bun test src/path/to/file.test.ts`
- Run the simulation utility: `bun run sim`
- Launch a level for testing: open `http://localhost:5173/?play=3&dev=invulnerable` (level IDs are listed in `src/levels.ts`)

## Development

Assume the development server is already running. Use the existing server for browser checks and local testing; do not start another server with `bun run dev` unless the user explicitly asks you to.

For level work, launch the target level with `?play=<id>&dev=invulnerable`, test mid-level play, and use DEV SETTINGS → SWITCH LEVEL for quick comparisons.

Binary assets under `assets/` and generated concept images under `output/imagegen/` are tracked with Git LFS. Before committing or pushing changes that touch LFS-tracked assets (`.glb`, images, or audio), check `git lfs status`, `git lfs ls-files`, and `git diff --stat`. Local commits do not upload LFS objects, but pushing multiple commits containing different versions of the same binary uploads each version. Before any requested push that includes asset changes, remind the user to squash/rebase or use `git reset --soft origin/main` when appropriate so only the intended final asset versions are pushed.

Keep changes focused, follow the existing TypeScript style, and run the relevant tests plus `bun run build` before handing off.
