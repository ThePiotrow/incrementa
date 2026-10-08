# Local runtime and persistence

`LocalRuntime.open({ engine, clock, repository, key })` loads a serialized snapshot or creates one at `clock.now()`, advances to the current time, and saves it. The runtime is the sole owner of its current local state. `snapshot` returns an independent copy. `dispatch` and `advance` serialize through a per-runtime promise queue; one failure does not poison later operations. Inputs are copied when queued and time is sampled when each operation executes.

The repository contract is intentionally small:

```ts
interface GameRepository {
  load(key: string): Promise<string | undefined>;
  save(key: string, serialized: string): Promise<void>;
}
```

`MemoryGameRepository` stores strings by key. It roundtrips real JSON, survives creating a second runtime around the same repository object, and provides **no durability across process exit**. A clock with `now(): number` can be injected for tests or host integration; `SystemClock` reads wall time only in this runtime package. Clock rollback is rejected rather than silently resimulating earlier time.

A successful transition is serialized and saved before the runtime replaces its state. A rejected write leaves its previous in-memory snapshot/time intact. Adapters must ensure a rejected `save` has not partially committed: the interface cannot manufacture that guarantee for a remote or unreliable store. Multiple calls on one runtime are ordered, but multiple runtimes/devices sharing a key are **unsupported concurrent writers**. No CAS, locking, deduplication, or server authority is implied by the revision field.

```json
{
  "formatVersion": 1,
  "frameworkVersion": "0.1.0",
  "state": {
    "gameId": "factory",
    "rulesVersion": "1",
    "schemaVersion": 1,
    "revision": 9,
    "time": 30000,
    "resources": {},
    "producers": {},
    "acquiredNodes": [],
    "items": [],
    "equipment": {}
  }
}
```

This illustrates the envelope; the maps must contain the exact keys required by the selected definition. Framework version identifies the writer, rules version identifies immutable game content, schema version identifies state layout, and revision counts accepted transitions. They are separate concerns. Changing a price/modifier/initial content requires a new rules version. The selected engine rejects game/rules mismatches; the standard validator supports only schema 1 and envelope format 1. A writer's framework version is informational and is not mistaken for a rules migration.

Loading validates quantities, reference keys, prerequisites, ownership, equipment eligibility, locked slots and duplicate-use invariants. It does not prove a client-earned balance or node acquisition. Local saves are player-controlled. Class instances, functions, accessors, undefined values, sparse arrays, cycles, nonfinite numbers, symbol keys and hidden properties cannot cross JSON state boundaries.

`serializeState(engine, state)` and `deserializeState(engine, text)` expose the same validation independently of the runtime. There are no migrations until a real second schema exists. Browser storage, databases, authoritative command handling, atomic idempotency and offline command reconciliation are future adapters/protocols, not partially implemented guarantees.
