import { defineAction, quantity } from '@incrementa/core';
import type { ActionContext } from '@incrementa/core';
import { GameEngine } from '@incrementa/engine';
import { Action, GameExtension, decoratedModule } from '@incrementa/decorators';
import { createGame } from '@incrementa/mechanics';
import type { GameDefinition, GameState } from '@incrementa/mechanics';
import { LocalRuntime, MemoryGameRepository } from '@incrementa/runtime-local';

function assert(condition: boolean, message: string): void { if (!condition) throw new Error(message); }
const schema = { parse(input: unknown): { amount: string } {
  if (!input || typeof input !== 'object' || !('amount' in input) || typeof input.amount !== 'string') throw new Error('invalid');
  quantity(input.amount);
  return { amount: input.amount };
} };

@GameExtension({ id: 'base', dependencies: ['economy'] })
class BaseActions {
  constructor(protected readonly factor: string) {}
  @Action({ id: 'gain', input: schema })
  gain(context: ActionContext<GameState, GameDefinition>, input: { amount: string }) {
    context.state.resources['coins'] = quantity(context.state.resources['coins']!).add(quantity(input.amount).mul(this.factor)).toString();
    return [];
  }
}
@GameExtension({ id: 'inherited', dependencies: ['economy'] })
class Inherited extends BaseActions {}

@GameExtension({ id: 'override', dependencies: ['economy'] })
class Override extends BaseActions {
  @Action({ id: 'gain', input: schema })
  override gain(context: ActionContext<GameState, GameDefinition>, input: { amount: string }) {
    context.state.resources['coins'] = quantity(context.state.resources['coins']!).add(quantity(input.amount).mul('10')).toString();
    return [];
  }
}
@GameExtension({ id: 'undecorated' })
class Undecorated extends BaseActions {
  override gain(_context: ActionContext<GameState, GameDefinition>, _input: { amount: string }) { return []; }
}

const content = { id: 'consumer', rulesVersion: '1', resources: [{ id: 'coins', initialAmount: '0' }] };
type Catalog = { gain: { amount: string } };
for (const [extension, expected] of [[new BaseActions('2'), '6'], [new Inherited('3'), '9'], [new Override('1'), '30']] as const) {
  const engine = createGame<Catalog>(content, { extensions: [decoratedModule<GameState, GameDefinition>(extension)] });
  assert(engine instanceof GameEngine, 'engine export works');
  const runtime = await LocalRuntime.open({ engine, clock: { now: () => 0 }, repository: new MemoryGameRepository(), key: 'consumer' });
  const result = await runtime.dispatch('gain', { amount: '3' });
  assert(result.state.resources['coins'] === expected, 'inherited/overridden method binding');
}
let rejected = false;
try { decoratedModule<GameState, GameDefinition>(new Undecorated('1')); } catch { rejected = true; }
assert(rejected, 'undecorated override must reject');

const explicit = defineAction<GameState, GameDefinition, { amount: string }>({
  id: 'gain', input: schema,
  run: (context, input) => new BaseActions('2').gain(context, input),
});
const engine = createGame<Catalog>(content, { extensions: [{ id: 'explicit', actions: [explicit] }] });
assert(engine.dispatch(engine.createState(), 'gain', { amount: '3' }).state.resources['coins'] === '6', 'explicit behavior matches');
