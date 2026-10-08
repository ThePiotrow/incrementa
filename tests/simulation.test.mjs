import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, purchaseCosts } from '@incrementa/mechanics';
import { factory, near } from './helpers.mjs';

test('constant production equals forty partitions exactly', () => {
  const d = factory();
  d.producers[0].production.outputs = [];
  d.producers[1].initialOwned = '10';
  const game = createGame(d);
  let partitioned = game.createState();
  for (let time = 50; time <= 2000; time += 50) partitioned = game.advanceTo(partitioned, time).state;
  assert.equal(partitioned.resources.ore, '20');
  assert.deepEqual(partitioned.resources, game.advanceTo(game.createState(), 2000).state.resources);
});

test('growing producer chain integrates rate over time rather than granting final rate retroactively', () => {
  const game = createGame(factory());
  const result = game.advanceTo(game.createState(), 10_000).state;
  assert.equal(result.producers.mine.generated, '10');
  assert.equal(result.resources.ore, '50');
  assert.equal(result.producers.mine.purchased, '0');
  let pieces = game.createState();
  for (const time of [3, 199, 500, 998, 2456, 9001, 10000]) pieces = game.advanceTo(pieces, time).state;
  assert.equal(pieces.resources.ore, '50');
  assert.deepEqual(pieces.producers, result.producers);
});

test('branched and longer chains converge across deterministic irregular call partitions', () => {
  const game = createGame({
    id: 'chain', rulesVersion: '1', resources: [{ id: 'ore', initialAmount: '0' }],
    producers: [
      { id: 'a', initialOwned: '1', production: { type: 'continuous', outputs: [{ target: { type: 'producer', id: 'b' }, amountPerSecondPerUnit: '1' }, { target: { type: 'producer', id: 'c' }, amountPerSecondPerUnit: '2' }] } },
      { id: 'b', initialOwned: '0', production: { type: 'continuous', outputs: [{ target: { type: 'producer', id: 'c' }, amountPerSecondPerUnit: '1' }] } },
      { id: 'c', initialOwned: '0', production: { type: 'continuous', outputs: [{ target: { type: 'resource', id: 'ore' }, amountPerSecondPerUnit: '1' }] } },
    ],
  });
  const whole = game.advanceTo(game.createState(), 6000).state;
  assert.equal(whole.producers.b.generated, '6');
  assert.equal(whole.producers.c.generated, '30');
  near(whole.resources.ore, '72'); // t² + t³/6
  for (let seed = 1; seed <= 30; seed++) {
    let random = seed;
    let state = game.createState();
    while (state.time < 6000) {
      random = (random * 16807) % 2147483647;
      state = game.advanceTo(state, Math.min(6000, state.time + random % 499 + 1)).state;
    }
    near(state.resources.ore, whole.resources.ore);
    near(state.producers.c.generated, whole.producers.c.generated);
  }
});

test('geometric multi-buy prices each unit and ignores generated holdings', () => {
  const d = factory();
  d.producers[1].purchase.scaling.factor = '2';
  const game = createGame(d);
  const state = game.advanceTo(game.createState(), 100_000).state;
  const bought = game.dispatch(state, 'producer.buy', { producerId: 'mine', quantity: 3 }).state;
  assert.equal(bought.resources.coins, '650'); // 50 + 100 + 200
  assert.deepEqual(bought.producers.mine, { purchased: '3', generated: '100' });
  assert.equal(purchaseCosts(game.definition.producers[1], '3', 1)[0].amount, '400');
});

test('flat and nearly-flat cost scaling avoid division by zero and subtractive cancellation', () => {
  const d = factory();
  d.producers[1].purchase.scaling.factor = '1';
  let game = createGame(d);
  assert.equal(purchaseCosts(game.definition.producers[1], '100000000000000000000', 1_000_000)[0].amount, '50000000');
  d.producers[1].purchase.scaling.factor = '1.0000000000000000000000000000000000000000000000001';
  game = createGame(d);
  near(purchaseCosts(game.definition.producers[1], '0', 2)[0].amount, '100', '1e-48');
});

test('aggregate production handles counts beyond native number range without per-unit objects', () => {
  const d = factory();
  d.producers[0].production.outputs = [];
  d.producers[1].initialOwned = '1e400';
  const game = createGame(d);
  const state = game.advanceTo(game.createState(), 2000).state;
  assert.equal(state.resources.ore, '2e+400');
  assert.equal(Object.keys(state.producers).length, 2);
  assert.ok(JSON.stringify(state).length < 1000);
});

test('multiple costs in the same currency are aggregated before affordability and debit', () => {
  const d = factory();
  d.resources[0].initialAmount = '75';
  d.producers[1].purchase.costs.push({ resourceId: 'coins', amount: '50' });
  const game = createGame(d);
  assert.equal(game.availability(game.createState(), 'producer.buy', { producerId: 'mine', quantity: 1 }).code, 'INSUFFICIENT_RESOURCES');
});
