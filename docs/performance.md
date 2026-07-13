# Performance testing

The performance runner uses headed Google Chrome by default, verifies that
invulnerability is active, warms up each level, then records frame pacing, CPU
spans, gameplay workload, console errors, and a screenshot.

Collision timings are split between player-projectile collision and the cheap
enemy line-of-fire AABB broad phase. Water and ground are never collidables.

Run one level:

```sh
bun run perf --levels=1
```

Run several levels:

```sh
bun run perf --levels=1,2,5
```

Run every level with a longer sample:

```sh
bun run perf --levels=all --duration=30000 --warmup=3000
```

Useful options:

- `--duration=10000`: measured milliseconds per level.
- `--warmup=2000`: unmeasured warmup milliseconds per level.
- `--fire=true`: continuously fire player shots during measurement.
- `--headless=false`: use headed Chrome for representative frame pacing.
- `--url=http://localhost:5173`: use an existing development server.
- `--width=1280 --height=720`: set a stable viewport.

Every invocation creates a timestamped directory under:

```text
tmp/performance/<timestamp>/
```

The directory contains a cross-level `summary.json`, a compact `report.md`, and
per-level raw samples, metadata, console errors, and screenshots.
