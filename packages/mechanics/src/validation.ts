import { ValidationError, quantity } from '@incrementa/core';
import type { DeepReadonly } from '@incrementa/core';
import { gameDefinitionSchema, gameStateSchema } from './model.js';
import type { GameDefinition, GameState } from './model.js';

function fail(path: string, message: string): never { throw new ValidationError(path, message); }
function unique(ids: readonly string[], path: string): void {
  if (new Set(ids).size !== ids.length) fail(path, 'duplicate IDs');
}
/** Kahn's algorithm avoids recursive stack limits and rejects all directed cycles. */
export function topologicalOrder(ids: readonly string[], edges: readonly (readonly [string, string])[], path: string): string[] {
  const degree = new Map(ids.map(id => [id, 0]));
  const outgoing = new Map(ids.map(id => [id, [] as string[]]));
  for (const [from, to] of edges) {
    if (!degree.has(from) || !degree.has(to)) fail(path, `unknown reference ${from} -> ${to}`);
    degree.set(to, (degree.get(to) ?? 0) + 1);
    outgoing.get(from)?.push(to);
  }
  const queue = ids.filter(id => degree.get(id) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const to of outgoing.get(queue[i]!) ?? []) {
      const remaining = degree.get(to)! - 1;
      degree.set(to, remaining);
      if (remaining === 0) queue.push(to);
    }
  }
  if (queue.length !== ids.length) fail(path, 'directed cycle is unsupported');
  return queue;
}

export function parseDefinition(input: unknown): GameDefinition {
  const parsed = gameDefinitionSchema.safeParse(input);
  if (!parsed.success) fail('definition', parsed.error.message);
  const d = parsed.data;
  for (const key of ['resources', 'producers', 'upgrades', 'collectibles', 'initialItems', 'slotGroups', 'nodes'] as const) unique(d[key].map(x => x.id), `definition.${key}`);
  const has = (key: 'resources' | 'producers' | 'upgrades' | 'collectibles' | 'slotGroups' | 'nodes', id: string, path: string): void => {
    if (!d[key].some(x => x.id === id)) fail(path, `unknown ${key} ID: ${id}`);
  };
  for (const [i, producer] of d.producers.entries()) {
    for (const [j, output] of producer.production.outputs.entries()) has(output.target.type === 'producer' ? 'producers' : 'resources', output.target.id, `producers.${i}.production.outputs.${j}.target`);
    for (const [j, cost] of (producer.purchase?.costs ?? []).entries()) has('resources', cost.resourceId, `producers.${i}.purchase.costs.${j}`);
  }
  topologicalOrder(d.producers.map(x => x.id), d.producers.flatMap(p => p.production.outputs.filter(o => o.target.type === 'producer').map(o => [p.id, o.target.id] as const)), 'producers');
  for (const group of d.slotGroups) if (group.baseCapacity > group.maxCapacity) fail(`slotGroups.${group.id}`, 'base capacity exceeds maximum');
  for (const [i, item] of d.initialItems.entries()) has('collectibles', item.definitionId, `initialItems.${i}.definitionId`);
  const upgradeRewards: string[] = [];
  for (const [i, node] of d.nodes.entries()) {
    unique(node.requires, `nodes.${i}.requires`);
    for (const id of node.requires) has('nodes', id, `nodes.${i}.requires`);
    for (const cost of node.costs) has('resources', cost.resourceId, `nodes.${i}.costs`);
    for (const reward of node.rewards) {
      if (reward.type === 'upgrade') { has('upgrades', reward.upgradeId, `nodes.${i}.rewards`); upgradeRewards.push(reward.upgradeId); }
      else has('slotGroups', reward.groupId, `nodes.${i}.rewards`);
    }
  }
  unique(upgradeRewards, 'nodes.rewards.upgradeId');
  for (const group of d.slotGroups) {
    const unlocked = d.nodes.flatMap(n => n.rewards).reduce((n, r) => n + (r.type === 'slots' && r.groupId === group.id ? r.count : 0), group.baseCapacity);
    if (unlocked > group.maxCapacity) fail(`slotGroups.${group.id}`, 'all unlocks exceed maximum capacity');
  }
  topologicalOrder(d.nodes.map(x => x.id), d.nodes.flatMap(n => n.requires.map(r => [r, n.id] as const)), 'nodes');
  for (const [kind, sources] of [['upgrades', d.upgrades], ['collectibles', d.collectibles]] as const) {
    for (const source of sources) for (const [i, modifier] of source.modifiers.entries()) {
      if (modifier.target.id) has('producers', modifier.target.id, `${kind}.${source.id}.modifiers.${i}.target`);
    }
  }
  return d;
}

export function slotCapacity(d: DeepReadonly<GameDefinition>, s: DeepReadonly<GameState>, groupId: string): number {
  const group = d.slotGroups.find(g => g.id === groupId);
  if (!group) throw new ValidationError('slotGroup', `unknown group ${groupId}`);
  return d.nodes.filter(n => s.acquiredNodes.includes(n.id)).flatMap(n => n.rewards)
    .reduce((capacity, reward) => capacity + (reward.type === 'slots' && reward.groupId === groupId ? reward.count : 0), group.baseCapacity);
}

export function createInitialState(d: DeepReadonly<GameDefinition>, time: number): GameState {
  return {
    gameId: d.id, rulesVersion: d.rulesVersion, schemaVersion: 1, revision: 0, time,
    resources: Object.fromEntries(d.resources.map(r => [r.id, quantity(r.initialAmount).toString()])),
    producers: Object.fromEntries(d.producers.map(p => [p.id, { purchased: '0', generated: quantity(p.initialOwned).toString() }])),
    acquiredNodes: [], items: d.initialItems.map(i => ({ ...i })),
    equipment: Object.fromEntries(d.slotGroups.map(g => [g.id, Array<string | null>(g.maxCapacity).fill(null)])),
  };
}

export function parseGameState(input: unknown, d: DeepReadonly<GameDefinition>): GameState {
  const parsed = gameStateSchema.safeParse(input);
  if (!parsed.success) fail('state', parsed.error.message);
  const s = parsed.data;
  if (s.gameId !== d.id || s.rulesVersion !== d.rulesVersion) fail('state', 'game/rules version mismatch');
  for (const key of ['resources', 'producers'] as const) {
    const expected = d[key].map(x => x.id);
    if (Object.keys(s[key]).length !== expected.length || expected.some(id => !Object.hasOwn(s[key], id))) fail(`state.${key}`, 'definition keys must match exactly');
  }
  for (const [id, value] of Object.entries(s.resources)) s.resources[id] = quantity(value).toString();
  for (const holding of Object.values(s.producers)) {
    holding.purchased = quantity(holding.purchased).toString();
    holding.generated = quantity(holding.generated).toString();
  }
  unique(s.acquiredNodes, 'state.acquiredNodes');
  for (const id of s.acquiredNodes) {
    const node = d.nodes.find(n => n.id === id);
    if (!node || node.requires.some(r => !s.acquiredNodes.includes(r))) fail('state.acquiredNodes', `unknown node or missing prerequisite: ${id}`);
  }
  unique(s.items.map(i => i.id), 'state.items');
  for (const item of s.items) if (!d.collectibles.some(c => c.id === item.definitionId)) fail(`state.items.${item.id}`, 'unknown collectible');
  if (Object.keys(s.equipment).length !== d.slotGroups.length) fail('state.equipment', 'group keys must match exactly');
  const equipped: string[] = [];
  for (const group of d.slotGroups) {
    const slots = s.equipment[group.id];
    if (!slots || slots.length !== group.maxCapacity) fail(`state.equipment.${group.id}`, 'invalid slots');
    for (const [index, id] of slots.entries()) {
      if (id === null) continue;
      if (index >= slotCapacity(d, s, group.id)) fail(`state.equipment.${group.id}.${index}`, 'slot is locked');
      const item = s.items.find(i => i.id === id);
      const definition = d.collectibles.find(c => c.id === item?.definitionId);
      if (!definition || !group.acceptTags.every(t => definition.tags.includes(t))) fail('state.equipment', 'item is unowned or ineligible');
      equipped.push(id);
    }
  }
  unique(equipped, 'state.equipment');
  return s;
}
