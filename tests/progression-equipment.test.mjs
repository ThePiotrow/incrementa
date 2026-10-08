import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, explainProduction, activeModifiers, modifierTargets, slotCapacity } from '@incrementa/mechanics';
import { factory, code } from './helpers.mjs';

test('upgrade/equipment boundaries advance old bonuses first; inactive ownership gives no bonus', () => {
  const game = createGame(factory());
  const initial = game.createState();
  assert.equal(explainProduction(game.definition, initial, 'mine').value, '1');
  const equipped = game.dispatch(initial, 'equipment.equip', { groupId: 'trophies', slot: 0, instanceId: 'gold-001' }, 10_000).state;
  assert.equal(equipped.resources.ore, '50');
  const upgraded = game.dispatch(equipped, 'progression.acquire', { nodeId: 'mining' }, 20_000).state;
  assert.equal(upgraded.resources.ore, '340'); // 50 + 150*2 - 10
  assert.equal(explainProduction(game.definition, upgraded, 'mine').value, '4');
  const later = game.advanceTo(upgraded, 30_000).state;
  assert.equal(later.resources.ore, '1340'); // 340 + 250*4
});

test('additive modifiers stack before multiplicative ones, with provenance and intersection targeting', () => {
  const d = factory();
  d.upgrades[0].modifiers.push({ target: { kind: 'producer', id: 'mine', category: 'wrong-category', stat: 'outputMultiplier' }, operation: 'multiply', value: '100' });
  d.upgrades[0].modifiers.push({ target: { kind: 'producer', tags: { all: ['mining'], none: ['industrial'] }, stat: 'outputMultiplier' }, operation: 'multiply', value: '100' });
  const game = createGame(d);
  let s = game.advanceTo(game.createState(), 10000).state;
  s = game.dispatch(s, 'progression.acquire', { nodeId: 'mining' }).state;
  s = game.dispatch(s, 'progression.acquire', { nodeId: 'display' }).state;
  s = game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 0, instanceId: 'gold-001' }).state;
  s = game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 1, instanceId: 'silver-001' }).state;
  const stat = explainProduction(game.definition, s, 'mine');
  assert.equal(stat.value, '8'); // (1+1)*2*2
  assert.deepEqual(stat.contributions.map(c => c.sourceId), ['upgrade:better-mines', 'item:gold-001', 'item:silver-001']);
  assert.equal(explainProduction(game.definition, s, 'maker').value, '1');
  const source = stat.contributions[1];
  assert.deepEqual(modifierTargets(game.definition, s, source), { potential: ['mine'], active: ['mine'] });
  s = game.dispatch(s, 'equipment.unequip', { groupId: 'trophies', slot: 0 }).state;
  assert.equal(explainProduction(game.definition, s, 'mine').value, '4');
  assert.deepEqual(modifierTargets(game.definition, s, source), { potential: ['mine'], active: [] });
});

test('existing bonuses affect newly purchased or generated matching producers automatically', () => {
  const d = factory();
  d.nodes[0].costs = [];
  const game = createGame(d);
  let s = game.dispatch(game.createState(), 'progression.acquire', { nodeId: 'mining' }).state;
  const source = activeModifiers(game.definition, s)[0];
  assert.deepEqual(modifierTargets(game.definition, s, source), { potential: ['mine'], active: [] });
  s = game.dispatch(s, 'producer.buy', { producerId: 'mine', quantity: 1 }).state;
  s = game.advanceTo(s, 2000).state;
  assert.equal(s.resources.ore, '8'); // (1*2 + 2²/2)*2
  assert.deepEqual(modifierTargets(game.definition, s, source).active, ['mine']);
});

test('second slot unlock is monotonic, checked once, and does not double count capacity', () => {
  const game = createGame(factory());
  let s = game.advanceTo(game.createState(), 10000).state;
  assert.equal(slotCapacity(game.definition, s, 'trophies'), 1);
  assert.throws(() => game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 1, instanceId: 'silver-001' }), code('SLOT_LOCKED'));
  assert.throws(() => game.dispatch(s, 'progression.acquire', { nodeId: 'display' }), code('PREREQUISITE_REQUIRED'));
  s = game.dispatch(s, 'progression.acquire', { nodeId: 'mining' }).state;
  s = game.dispatch(s, 'progression.acquire', { nodeId: 'display' }).state;
  assert.equal(slotCapacity(game.definition, s, 'trophies'), 2);
  s = game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 1, instanceId: 'silver-001' }).state;
  assert.equal(s.equipment.trophies[1], 'silver-001');
  assert.throws(() => game.dispatch(s, 'progression.acquire', { nodeId: 'display' }), code('ALREADY_ACQUIRED'));
  assert.equal(slotCapacity(game.definition, s, 'trophies'), 2);
});

test('ownership, eligibility, duplicate instance, and explicit occupied-slot replacement are enforced', () => {
  const d = factory();
  d.collectibles.push({ id: 'stone', tags: ['material'], modifiers: [] });
  d.initialItems.push({ id: 'stone-001', definitionId: 'stone' });
  const game = createGame(d);
  let s = game.advanceTo(game.createState(), 10000).state;
  const equip = (instanceId, replace = false) => game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 0, instanceId, replace });
  assert.throws(() => equip('unowned'), code('ITEM_NOT_OWNED'));
  assert.throws(() => equip('stone-001'), code('ITEM_INELIGIBLE'));
  s = equip('gold-001').state;
  assert.throws(() => equip('silver-001'), code('SLOT_OCCUPIED'));
  s = equip('silver-001', true).state;
  assert.equal(s.items.length, 3);
  assert.equal(s.equipment.trophies[0], 'silver-001');
  s = game.dispatch(s, 'progression.acquire', { nodeId: 'mining' }).state;
  s = game.dispatch(s, 'progression.acquire', { nodeId: 'display' }).state;
  assert.throws(() => game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 1, instanceId: 'silver-001', replace: true }), code('ALREADY_EQUIPPED'));
  s = game.dispatch(s, 'equipment.unequip', { groupId: 'trophies', slot: 0 }).state;
  s = game.dispatch(s, 'equipment.equip', { groupId: 'trophies', slot: 1, instanceId: 'silver-001' }).state;
  assert.deepEqual(s.equipment.trophies, [null, 'silver-001']);
});
