# Contributing

Use Node 22+ and pnpm 11.9.0. The implementation was verified locally on Node 25.8.1 with TypeScript 6.0.3. Package versions are coordinated at `0.1.0` and names are provisional.

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`verify` builds each package in dependency order, typechecks, runs the Node test suite, and executes the factory example. For focused work:

```sh
pnpm build
node --test tests/simulation.test.mjs
pnpm typecheck
pnpm test
pnpm example
```

Root `typecheck` builds dependency declarations first, so it works without existing build output. Tests use public built exports with no TypeScript source aliases. The packed-consumer test packs the five libraries **locally**, installs those tarballs in a temporary external directory with pnpm offline, compiles standard-decorator consumers, runs them, and verifies that malformed typed dispatch fails compilation. It deletes its temporary directory and never publishes. The first normal install must populate the pnpm store for decimal.js and Zod.

Preserve these boundaries:

- Keep all player facts in JSON state and all shared content in immutable versioned definitions.
- Keep engine actions/simulators synchronous, deterministic, and free of clocks, storage and networking.
- Validate new external content, references, state invariants and action inputs. Treat business refusals separately from invalid content/programming errors.
- Integrate coupled temporal systems together. Add expected-value and partition tests for new time semantics.
- Add meaningful tests for behavior/failure paths and public package consumption; avoid tests tied only to private implementation structure.
- Import other packages through their public entry points. Update deliberate exports, docs and runnable examples together.

Tests cover action registration equivalence, module errors, malformed inputs, rollback, multi-player isolation, integrated chains, modifier boundaries, equipment, numeric limits, serialized persistence, write failure and external package consumption. No benchmark claims are made.

Do not silently change an existing rules version when changing game content. Do not introduce an unrelated license or ownership metadata. There is no release or deployment workflow in this first version.
