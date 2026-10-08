import test from 'node:test';
import assert from 'node:assert/strict';
import { defineAction, DomainError, quantity, ValidationError } from '@incrementa/core';
import { createGame, economyModule, modifiersModule } from '@incrementa/mechanics';
import { decoratedModule } from '@incrementa/decorators';
import { FactoryActions, gatherInput } from '../examples/factory/dist/actions.js';
import { factory, code } from './helpers.mjs';

test('explicit and decorated actions share behavior, validation, binding, and per-instance metadata', () => {
  const explicit = defineAction({ id: 'factory.gather', input: gatherInput, run: ({ state }, input) => {
    state.resources.coins = quantity(state.resources.coins).add(input.amount).toString();
    return [{ type: 'factory.gathered', data: { amount: input.amount } }];
  } });
  const a = createGame(factory(), { extensions: [decoratedModule(new FactoryActions())] });
  const b = createGame(factory(), { extensions: [{ id: 'explicit', dependencies: ['economy'], actions: [explicit] }] });
  assert.deepEqual(a.dispatchUnknown(a.createState(), 'factory.gather', { amount: '5' }), b.dispatchUnknown(b.createState(), 'factory.gather', { amount: '5' }));
  const c = createGame(factory(), { extensions: [decoratedModule(new FactoryActions('ore'))] });
  assert.equal(c.dispatchUnknown(c.createState(), 'factory.gather', { amount: '5' }).state.resources.ore, '5');
  assert.equal(a.dispatchUnknown(a.createState(), 'factory.gather', { amount: '5' }).state.resources.ore, '0');
  assert.throws(() => a.dispatchUnknown(a.createState(), 'factory.gather', { amount: '100' }), code('INVALID_INPUT'));
});

test('module assembly rejects missing dependencies, dependency cycles and duplicate registrations', () => {
  const empty = { id: 'empty', rulesVersion: '1' };
  assert.throws(() => createGame(empty, { extensions: [{ id: 'broken', dependencies: ['missing'] }] }), /missing dependency: missing/);
  assert.throws(() => createGame(empty, { extensions: [{ id: 'a', dependencies: ['b'] }, { id: 'b', dependencies: ['a'] }] }), /dependency cycle/);
  assert.throws(() => createGame(empty, { extensions: [economyModule] }), /duplicate.*module ID/);
  const action = defineAction({ id: 'duplicate', input: { parse: x => x }, run: () => [] });
  assert.throws(() => createGame(empty, { extensions: [{ id: 'a', actions: [action, action] }] }), /duplicate.*action ID/);
  const system = { id: 'same', advance: () => [] };
  assert.throws(() => createGame(empty, { extensions: [{ id: 'a', systems: [system, system] }] }), /duplicate.*system ID/);
  assert.throws(() => createGame(factory(), { modules: [economyModule, modifiersModule] }), /content requires module: production/);
});

test('a resource-only game requires no production, collection, or progression module', () => {
  const game = createGame({ id: 'simple', rulesVersion: '1', resources: [{ id: 'coin', initialAmount: '1' }] });
  assert.deepEqual(game.moduleIds, ['economy', 'modifiers']);
  assert.equal(game.advanceTo(game.createState(), 1000).state.resources.coin, '1');
});

test('malformed external input fails; availability is structured and rechecked at dispatch', () => {
  const game = createGame(factory());
  const initial = game.createState();
  for (const input of [undefined, NaN, () => {}, null, {}, [], { producerId: 'mine', quantity: '1' }, { producerId: 'mine', quantity: 0 }, { producerId: 'mine', quantity: 1.5 }, { producerId: 'mine', quantity: 1_000_001 }, { producerId: 'mine', quantity: 1, price: '0' }]) {
    assert.throws(() => game.dispatchUnknown(initial, 'producer.buy', input), code('INVALID_INPUT'));
  }
  assert.equal(game.availability(initial, 'producer.buy', { producerId: 'mine', quantity: 1 }).allowed, true);
  const poor = structuredClone(initial);
  poor.resources.coins = '0';
  assert.equal(game.availability(poor, 'producer.buy', { producerId: 'mine', quantity: 1 }).code, 'INSUFFICIENT_RESOURCES');
  const snapshot = structuredClone(poor);
  assert.throws(() => game.dispatch(poor, 'producer.buy', { producerId: 'mine', quantity: 1 }, 10_000), code('INSUFFICIENT_RESOURCES'));
  assert.deepEqual(poor, snapshot);
  assert.throws(() => game.dispatchUnknown(initial, 'missing', {}), code('UNKNOWN_ACTION'));
});

test('a handler that throws or produces invalid state cannot partially mutate caller state', () => {
  const game = createGame(factory(), { extensions: [{ id: 'bad-actions', actions: [
    defineAction({ id: 'throw', input: { parse: x => x }, run: ({ state }) => { state.resources.coins = '0'; throw new DomainError('REFUSED', 'refused'); } }),
    defineAction({ id: 'invalid', input: { parse: x => x }, run: ({ state }) => { state.resources.coins = '-1'; return []; } }),
    defineAction({ id: 'clock', input: { parse: x => x }, run: ({ state }) => { state.time++; return []; } }),
  ] }] });
  const initial = game.createState();
  for (const id of ['throw', 'invalid', 'clock']) assert.throws(() => game.dispatchUnknown(initial, id, {}));
  assert.deepEqual(initial, game.createState());
});

test('one engine isolates two players, definitions, returned states, and availability checks', () => {
  const content = factory();
  const game = createGame(content);
  content.producers[1].purchase.costs[0].amount = '0';
  const first = game.createState();
  const second = game.createState();
  const bought = game.dispatch(first, 'producer.buy', { producerId: 'mine', quantity: 1 });
  assert.equal(bought.state.resources.coins, '950');
  assert.equal(second.resources.coins, '1000');
  assert.deepEqual(first, second);
  bought.state.resources.coins = '0';
  assert.equal(game.createState().resources.coins, '1000');
  assert.throws(() => { game.definition.resources[0].initialAmount = '0'; }, TypeError);
});

test('invalid definitions reject duplicate IDs, unknown targets and handlers, graph cycles, capacity errors', () => {
  const cases = [
    d => d.resources.push(d.resources[0]),
    d => { d.producers[0].production.outputs[0].target.id = 'ghost'; },
    d => { d.producers[0].production.type = 'discrete'; },
    d => { d.upgrades[0].modifiers[0].target.id = 'ghost'; },
    d => { d.upgrades[0].modifiers[0].operation = 'custom'; },
    d => { d.nodes[0].rewards[0].upgradeId = 'missing'; },
    d => { d.nodes[0].requires = ['display']; },
    d => { d.producers[1].production.outputs.push({ target: { type: 'producer', id: 'maker' }, amountPerSecondPerUnit: '1' }); },
    d => { d.slotGroups[0].maxCapacity = 1; },
    d => { d.resources[0].initialAmount = 'Infinity'; },
    d => { d.producers[1].purchase.scaling.factor = '0.9'; },
    d => { d.nodes[0].costs[0].resourceId = 'missing'; },
  ];
  for (const mutate of cases) {
    const content = factory(); mutate(content);
    assert.throws(() => createGame(content), ValidationError);
  }
});

test('time and revision bounds are explicit', () => {
  const game = createGame(factory());
  const s = game.createState(1000);
  assert.throws(() => game.advanceTo(s, 999), code('TIME_REVERSED'));
  for (const invalid of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => game.createState(invalid), ValidationError);
  assert.equal(game.advanceTo(s, s.time).state.revision, 0);
  assert.equal(game.dispatch(s, 'producer.buy', { producerId: 'mine', quantity: 1 }, 2000).state.revision, 1);
  const overflow = { ...s, revision: Number.MAX_SAFE_INTEGER };
  assert.throws(() => game.advanceTo(overflow, 2000), ValidationError);
});
