# Creating games and extensions

Use a typed object with `satisfies GameContent`, or parse JSON to `unknown` and pass it to `createGame`. Both go through `parseDefinition`. Unknown fields and mechanics are rejected, with paths from the schema validator. IDs start with a letter and contain letters, digits, underscores or hyphens, up to 64 characters; reserved object keys are excluded. Numeric economic values are decimal strings.

```ts
import { createGame } from '@incrementa/mechanics';
import type { GameContent } from '@incrementa/mechanics';

const content = {
  id: 'mines', rulesVersion: '1',
  resources: [{ id: 'coins', initialAmount: '100' }],
  producers: [{
    id: 'mine', tags: ['mining'], initialOwned: '0',
    purchase: {
      costs: [{ resourceId: 'coins', amount: '10' }],
      scaling: { type: 'geometric', factor: '1.15' },
    },
    production: {
      type: 'continuous',
      outputs: [{ target: { type: 'resource', id: 'coins' }, amountPerSecondPerUnit: '1' }],
    },
  }],
} satisfies GameContent;

const game = createGame(content);
const bought = game.dispatch(game.createState(), 'producer.buy', { producerId: 'mine', quantity: 2 });
const later = game.advanceTo(bought.state, 10_000);
```

`producer.buy` accepts integer quantities 1–1,000,000. Geometric pricing sums every purchased unit from the existing **purchased** count; generated holdings never raise prices. Multiple costs for the same resource are aggregated before affordability/debit. `purchaseCosts` can display the quote; the action calculates it again.

Upgrades in this version have one acquired level and a list of modifiers. A progression node references upgrade IDs and/or slot unlock rewards; all `requires` nodes must already be acquired. `progression.acquire({ nodeId })` pays costs and records acquisition atomically. Nodes may have multiple roots and prerequisites. One upgrade can be granted by only one node, avoiding duplicated activation. There is no reset or capacity loss.

```ts
{
  target: {
    kind: 'producer', id: 'mine', category: 'extractor',
    tags: { all: ['mining'], none: ['experimental'] },
    stat: 'outputMultiplier',
  },
  operation: 'multiply', value: '2',
}
```

All selector criteria intersect. `outputMultiplier` has base 1. First sum `add` modifiers into the base, then multiply by each `multiply` modifier. Values are nonnegative. No priority, replacement, stat-to-stat reference, instance selector, or hidden downstream propagation is supported. Tag/category selectors may currently match no definitions; exact IDs must exist. Newly owned matching producers receive bonuses automatically. `explainProduction` reports the computed stat and source IDs; `modifierTargets` distinguishes potential definitions from currently owned targets affected by an active source.

Collectible definitions describe tags and modifiers. `initialItems` declares individual owned instances; these are separate from aggregate producer counts. Slot groups have a base capacity, maximum capacity (at most 1,000), and required acceptance tags. The example starts with one trophy slot and unlocks exactly one more through a node reward.

`equipment.equip({ groupId, slot, instanceId, replace? })` requires ownership, an available zero-based slot, accepted tags, and an unequipped instance. An occupied slot requires `replace: true`; the displaced item remains owned and becomes inactive. An instance cannot appear in two slots or be moved implicitly: unequip it first. `equipment.unequip({ groupId, slot })` is an allowed no-op on an empty available slot. Bonuses are active only while equipped.

For explicit custom actions, call `defineAction<S, D, Input>({ id, input, check?, run })` and put the returned action in a `GameModule<S, D>`. `input` implements `InputSchema<Input>` (Zod schemas work). `check` returns `allowed` or `denied(code, message)`. `run` edits only its isolated draft and returns domain events. The same contract is used by [decorators](decorators.md).

Pass extension modules through `createGame<YourActionCatalog>(content, { extensions })`. The catalog maps string IDs to input types and preserves dispatch checking. It is an explicit author-maintained contract, not inferred from decorators: test that catalog IDs and schemas agree. Optional built-in module actions remain in `MechanicActions`; dispatching an omitted module's action returns `UNKNOWN_ACTION`. External callers use `dispatchUnknown` and receive the same runtime validation.

For state/content shapes beyond the standard mechanics, construct `GameEngine<S, D, Catalog>` directly with a JSON definition, `createState`, `parseState`, and custom modules. The state validator is responsible for schema versions, references and game-specific invariants. Simulators receive explicit target times and must preserve the documented partition semantics. Custom I/O belongs in a runtime, never inside an action or simulator.
