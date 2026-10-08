import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '@incrementa/core';
import { createGame } from '@incrementa/mechanics';
import { LocalRuntime, MemoryGameRepository, serializeState, deserializeState } from '@incrementa/runtime-local';
import { factory } from './helpers.mjs';

test('serialization roundtrip retains huge quantities, equipment, rules/schema/revision/time and no derived sources', () => {
  const d = factory(); d.resources[0].initialAmount = '1e400';
  const game = createGame(d);
  let s = game.advanceTo(game.createState(), 10000).state;
  s = game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 0, instanceId: 'gold-001' }).state;
  const serialized = serializeState(game, s);
  const envelope = JSON.parse(serialized);
  assert.equal(envelope.frameworkVersion, '0.1.0');
  assert.deepEqual(deserializeState(game, serialized), s);
  assert.equal(deserializeState(game, serialized).resources.coins, '1e+400');
  assert.ok(!serialized.includes('modifiers'));
});

test('save validation rejects malformed state, unsupported versions, forged equipment and bad prerequisites', () => {
  const game = createGame(factory());
  const original = JSON.parse(serializeState(game, game.createState()));
  for (const mutate of [
    e => { e.formatVersion = 2; },
    e => { e.state.schemaVersion = 2; },
    e => { e.state.rulesVersion = '2'; },
    e => { e.state.gameId = 'different'; },
    e => { e.state.resources.coins = '-1'; },
    e => { e.state.resources.extra = '10'; },
    e => { delete e.state.resources.ore; },
    e => { e.state.producers.mine.purchased = '1.1'; },
    e => { e.state.time = 1.1; },
    e => { e.state.equipment.trophies[1] = 'gold-001'; },
    e => { e.state.equipment.trophies[0] = 'missing'; },
    e => { e.state.acquiredNodes = ['display']; },
    e => { e.state.items.push(e.state.items[0]); },
  ]) {
    const envelope = structuredClone(original); mutate(envelope);
    assert.throws(() => deserializeState(game, JSON.stringify(envelope)), ValidationError);
  }
  assert.throws(() => deserializeState(game, '{'), /malformed JSON/);
  const forged = structuredClone(original);
  forged.state.acquiredNodes = ['mining', 'display'];
  forged.state.equipment.trophies = ['gold-001', 'gold-001'];
  assert.throws(() => deserializeState(game, JSON.stringify(forged)), /duplicate IDs/);
});

test('runtime injects time, loads snapshots and calculates passive progression after absence', async () => {
  const engine = createGame(factory());
  const repository = new MemoryGameRepository();
  let now = 0;
  const options = { engine, repository, clock: { now: () => now }, key: 'player' };
  const runtime = await LocalRuntime.open(options);
  now = 10000;
  await runtime.dispatch('equipment.equip', { groupId: 'trophies', slot: 0, instanceId: 'gold-001' });
  assert.equal(runtime.snapshot.resources.ore, '50');
  now = 20000;
  const loaded = await LocalRuntime.open(options);
  assert.equal(loaded.snapshot.resources.ore, '350');
  const snapshot = loaded.snapshot; snapshot.resources.coins = '0';
  assert.equal(loaded.snapshot.resources.coins, '1000');
  assert.deepEqual(deserializeState(engine, await repository.load('player')), loaded.snapshot);
});

test('runtime serializes concurrent calls, captures inputs, and continues after a refused action', async () => {
  const engine = createGame(factory());
  const runtime = await LocalRuntime.open({ engine, repository: new MemoryGameRepository(), clock: { now: () => 0 }, key: 'player' });
  const input = { producerId: 'mine', quantity: 1 };
  const first = runtime.dispatch('producer.buy', input);
  input.quantity = 1000000;
  const refused = runtime.dispatch('producer.buy', { producerId: 'mine', quantity: 100 });
  const second = runtime.dispatch('producer.buy', { producerId: 'mine', quantity: 1 });
  const results = await Promise.allSettled([first, refused, second]);
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.equal(runtime.snapshot.producers.mine.purchased, '2');
  assert.equal(runtime.snapshot.resources.coins, '892.5');
  assert.equal(runtime.snapshot.revision, 2);
});

test('failed persistence does not advance in-memory state or lose elapsed time', async () => {
  const engine = createGame(factory());
  const memory = new MemoryGameRepository();
  let fail = false;
  let now = 0;
  const repository = { load: key => memory.load(key), save: (key, data) => { if (fail) return Promise.reject(new Error('disk unavailable')); return memory.save(key, data); } };
  const runtime = await LocalRuntime.open({ engine, repository, clock: { now: () => now }, key: 'p' });
  now = 10000; fail = true;
  await assert.rejects(runtime.advance(), /disk unavailable/);
  assert.equal(runtime.snapshot.time, 0);
  fail = false;
  await runtime.advance();
  assert.equal(runtime.snapshot.resources.ore, '50');
});
