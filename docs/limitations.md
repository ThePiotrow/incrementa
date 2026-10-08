# Scope of version 0.1.0

This is a working vertical slice, not the entire Incrementa roadmap.

| Supported now | Deferred / extension boundary |
| --- | --- |
| Resource purchases, geometric multi-buy | Other cost rules can be implemented as actions/helpers |
| Continuous acyclic producer chains | Cycles, discrete recipes, depletion, caps need explicit simulation semantics |
| Nonnegative add/multiply output modifiers | Other stats, replacement/priority, stat dependencies need a resolver extension |
| ID/category/all/none tag selectors | Instance/relation/custom selectors need validated resolver extensions |
| One-off upgrades through progression nodes | Upgrade levels/cards, general conditions and all/any/not composition need new content/schema support |
| Prerequisite DAG and monotonic slot rewards | Exclusive branches, reset/retention, decreasing capacity need new invariants |
| Owned collectible instances, equip/unequip/replacement | Loot, inventory capacity, rolled values, equipment sets are separate mechanics |
| Action-time bonus boundaries | Temporary boosts and timed trophy lifetimes need timed boundary orchestration |
| Local serialized snapshots with memory adapter | Browser/durable/server adapters need actual persistence guarantees |
| Synchronous explicit/decorated actions | External I/O and trusted randomness belong in runtime orchestration |
| Typed action catalog supplied by author | Automatic catalog inference from decorator metadata is not implemented |

Custom action/module/system contracts are real extension points. The standard content schema deliberately rejects unknown mechanics; it does not pretend to load arbitrary handler names. Advanced content can be implemented with a separately typed definition/state and `GameEngine`, or by extending the cohesive mechanics schema and its tests.

There is no NestJS, frontend, HTTP/WebSocket server, authentication, SQL/MongoDB adapter, prestige, combat, full loot, general relation graph, event reactions, save migration, or offline networking protocol in this version. There are no placeholder packages advertising those features. Timed boosts are specifically deferred; only action-time modifier changes are simulated.

Single-writer local operation has no anti-cheat authority. A future authoritative runtime must provide trusted time, player identity, concurrency control, transactionally persisted commands/results and explicit replay policy. Historical offline purchase times cannot be proven from client timestamps. Domain events here are informational facts, not durable external notification delivery.

ESM imports and declarations are provided. CommonJS exports and legacy decorators are not supported. The namespace and legal license remain undecided; publication/release automation is not configured.
