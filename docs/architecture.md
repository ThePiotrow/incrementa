# Architecture

The deterministic engine knows only definition identity, state identity, registered actions, simulation systems, and a supplied state validator/factory. It does not import the standard mechanics. One configured engine can process many independent player states. There is no current-player singleton, service locator, global event bus, storage, network, clock, or randomness in the engine.

```text
decorators ──→ core ←── engine
                         ↑
              mechanics  │  runtime-local
                   ↑     │      ↑
                   └──── factory ┘
```

Both mechanics and runtime-local also depend on core. The factory is an example, never a library dependency.

The first slice keeps related mechanics in a single package with separately selectable `GameModule`s. `createGame` selects the modules required by content, or validates an explicit module list. Economy and modifiers provide reusable services; production requires both. Progression requires economy and modifiers. Equipment requires modifiers. A resource-only game does not need production, progression, or equipment. Class-based actions can instead extend `AbstractGameAction` to share schema parsing and authoritative precondition checks.

Definitions are parsed, copied, and deeply frozen at assembly. Mutable state contains only JSON facts: balances, purchased/generated producer holdings, acquired node IDs, item instances, equipment, and identity/time metadata. Derived capacities and modifiers are recomputed. Initial producer holdings are non-purchased/generated holdings; only paid acquisitions increase purchase history.

For a successful dispatch, the engine:

1. Parses and copies the supplied state.
2. Advances its draft to the explicit action time using existing modifiers.
3. Parses input and rechecks action preconditions against that draft.
4. Executes the synchronous action, validates the resulting state, and increments the revision once.
5. Returns state and informational domain events.

A refusal or exception discards the whole draft, including catch-up in that request. The caller retains the earlier timestamp, so the next attempt can account for all elapsed time. A separate `advanceTo` can persist passive progress even when an action is refused. Availability is an advisory query on a frozen copy at a requested time; it never replaces execution checks.

`DomainError` carries a stable business code, such as `INSUFFICIENT_RESOURCES`, `SLOT_LOCKED`, or `INVALID_INPUT`. `ValidationError` reports malformed definitions/state or unsupported numeric ranges. Unexpected exceptions remain programmer errors. Events do not complete transactions or trigger hidden state changes.

Module IDs, action IDs, and simulation-system IDs are unique per assembly. Dependencies are topologically ordered; missing dependencies and cycles fail before play. Definition validation checks references, production/progression DAGs, unique IDs, slot bounds, and supported declarative variants. Custom declarative handler names are not accepted by this slice's schema.

Systems execute in dependency order over the same interval. **Interacting temporal mechanics must be integrated by one coordinating system**, as production does for the whole producer DAG. Registering independent systems does not automatically make their coupled mathematics partition invariant. Extension code is trusted synchronous game code; avoid mutable player-specific fields on shared action instances.

Decimal.js supplies bounded decimal arithmetic; Zod supplies strict runtime schemas and inferred authoring types. These are the only runtime dependencies beyond other Incrementa packages. Core/engine/runtime builds use ES-only libraries; mechanics includes DOM declaration types solely because Zod's declarations refer to `URL`. Mechanics does not call browser APIs. Node APIs are confined to tests and the example.

Tooling choices were checked against the [TypeScript standard decorator documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html), [decimal.js API](https://mikemcl.github.io/decimal.js/), and [pnpm workspace documentation](https://pnpm.io/workspaces). TypeScript 6.0.3 was chosen as a supported stable compiler with the documented decorator model; upgrading the compiler is not part of the game rules.
