# Incrementa

A modular TypeScript framework for incremental games. This first version includes a deterministic engine, continuous producer chains, purchases, production modifiers, a small progression graph, trophy equipment, standard decorators, and a local save/runtime boundary.

Five library packages and one executable example share coordinated version `0.1.0`. The `@incrementa` namespace is provisional. All packages are private; nothing has been published and no license has been selected.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm example
```

Node 22+ and pnpm 11.9.0 are required. `pnpm verify` builds, typechecks, runs all tests (including packed-package consumption), and executes the example. The checked toolchain is TypeScript 6.0.3; the example compiles decorators with `tsc` before Node executes them.

The example buys mines, integrates a maker → mine → ore chain, acquires an upgrade, equips a trophy, unlocks the second display slot, and reloads after an absence. It produces **70 ore at second 10**, **1,400 at second 20**, and **3,560 after reloading at second 30**, after progression costs.

Author custom actions with explicit schemas and ordinary classes:

```ts
import { quantity } from '@incrementa/core';
import type { ActionContext } from '@incrementa/core';
import { Action, GameExtension, decoratedModule } from '@incrementa/decorators';
import { createGame } from '@incrementa/mechanics';
import type { GameDefinition, GameState } from '@incrementa/mechanics';

const input = {
  parse(value: unknown): { amount: string } {
    if (!value || typeof value !== 'object' || !('amount' in value)
      || typeof value.amount !== 'string'
      || quantity(value.amount).compare('0') <= 0
      || quantity(value.amount).compare('10') > 0) throw new Error('Invalid amount');
    return { amount: value.amount };
  },
};

@GameExtension({ id: 'gathering', dependencies: ['economy'] })
class Gathering {
  @Action({ id: 'coins.gather', input })
  gather({ state }: ActionContext<GameState, GameDefinition>, { amount }: { amount: string }) {
    state.resources['coins'] = quantity(state.resources['coins']!).add(amount).toString();
    return [{ type: 'coins.gathered', data: { amount } }];
  }
}

const game = createGame<{ 'coins.gather': { amount: string } }>({
  id: 'demo', rulesVersion: '1',
  resources: [{ id: 'coins', initialAmount: '0' }],
}, { extensions: [decoratedModule<GameState, GameDefinition>(new Gathering())] });

const result = game.dispatch(game.createState(), 'coins.gather', { amount: '5' });
// result.state.resources['coins'] === '5'
```

The full runnable [factory example](examples/factory/src/main.ts) uses this dispatch path through `LocalRuntime` and includes the production/equipment loop. Input validation remains active when TypeScript is bypassed.

| Package | Responsibility |
| --- | --- |
| `@incrementa/core` | Decimal quantities, errors, actions/modules/systems, JSON data contracts |
| `@incrementa/engine` | Module assembly, immutable definitions, action transactions, explicit time |
| `@incrementa/mechanics` | Validated content/state and optional economy, production, modifiers, progression, equipment modules |
| `@incrementa/decorators` | Standard method/class metadata converted to ordinary modules |
| `@incrementa/runtime-local` | Injectable clock, serialized operations, save envelope, in-memory repository |
| `@incrementa/factory` | Executable game content and decorated custom action |

Start with [authoring](docs/authoring.md). See [architecture](docs/architecture.md), [decorators](docs/decorators.md), [simulation and numbers](docs/simulation.md), [persistence](docs/persistence.md), [limitations](docs/limitations.md), and [contributing](CONTRIBUTING.md).
