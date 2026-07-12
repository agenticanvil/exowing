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

Keep changes focused, follow the existing TypeScript style, and run the relevant tests plus `bun run build` before handing off.
