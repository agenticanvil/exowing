# Exowing

Exowing is a browser-based arcade flight combat game built with TypeScript,
Three.js, and Vite. Fly through a sequence of procedural environments, evade
enemy fire, and defeat each level's guardian.

## Running locally

[Bun](https://bun.sh/) is required.

```sh
bun install
bun run dev
```

Open the local URL printed by Vite, normally <http://localhost:5173>.

## Controls

| Action              | Control |
| ------------------- | ------- |
| Move                | W A S D |
| Barrel roll / dodge | Q / E   |
| Primary fire        | Space   |
| Lock/fire missiles  | F       |
| Fly faster          | Shift   |
| Brake               | Alt     |
| Pause               | Escape  |

## Development

```sh
bun run build         # Type-check and create a production build
bun test              # Run the test suite
bun run check         # Check formatting, lint, tests, and build
bun run sim           # Run the simulation utility
```

In development, a specific level can be launched with query parameters:

```text
http://localhost:5173/?play=3&dev=invulnerable
```

The available level IDs are defined in [`src/levels.ts`](src/levels.ts).

## Assets

The models and images in this repository were created for Exowing with the
assistance of OpenAI Codex.

## License

Exowing is available under the [MIT License](LICENSE).
