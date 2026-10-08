import { quantity, ValidationError } from '@incrementa/core';
import type { DeepReadonly, Quantity } from '@incrementa/core';
import type { GameDefinition, GameState, Modifier, ProducerDefinition, Selector } from './model.js';

export interface ModifierContribution { readonly sourceId: string; readonly modifier: DeepReadonly<Modifier> }
export interface StatExplanation { readonly base: string; readonly value: string; readonly contributions: readonly ModifierContribution[] }

/** Criteria are intersected. Tags are definition tags, not per-instance state. */
export function matchesTarget(producer: DeepReadonly<ProducerDefinition>, selector: DeepReadonly<Selector>): boolean {
  return (!selector.id || selector.id === producer.id)
    && (!selector.category || selector.category === producer.category)
    && (selector.tags?.all.every(t => producer.tags.includes(t)) ?? true)
    && !(selector.tags?.none.some(t => producer.tags.includes(t)) ?? false);
}

/** Derive sources from acquisition and equipment; never persist resolved modifiers. */
export function activeModifiers(d: DeepReadonly<GameDefinition>, s: DeepReadonly<GameState>): ModifierContribution[] {
  const contributions: ModifierContribution[] = [];
  for (const node of d.nodes) {
    if (!s.acquiredNodes.includes(node.id)) continue;
    for (const reward of node.rewards) {
      if (reward.type !== 'upgrade') continue;
      const upgrade = d.upgrades.find(u => u.id === reward.upgradeId);
      for (const modifier of upgrade?.modifiers ?? []) contributions.push({ sourceId: `upgrade:${reward.upgradeId}`, modifier });
    }
  }
  const equipped = new Set(Object.values(s.equipment).flat());
  for (const item of s.items) {
    if (!equipped.has(item.id)) continue;
    const definition = d.collectibles.find(c => c.id === item.definitionId);
    for (const modifier of definition?.modifiers ?? []) contributions.push({ sourceId: `item:${item.id}`, modifier });
  }
  return contributions;
}

/** The initial stat is outputMultiplier, base 1, nonnegative. Add first, multiply second.
 * Order within each phase follows definition order (nodes, then owned instances).
 */
export function resolveStat(base: string, contributions: readonly ModifierContribution[]): Quantity {
  let result = quantity(base);
  for (const { modifier } of contributions) if (modifier.operation === 'add') result = result.add(modifier.value);
  for (const { modifier } of contributions) if (modifier.operation === 'multiply') result = result.mul(modifier.value);
  return result;
}

export function explainProduction(d: DeepReadonly<GameDefinition>, s: DeepReadonly<GameState>, producerId: string): StatExplanation {
  const producer = d.producers.find(p => p.id === producerId);
  if (!producer) throw new ValidationError('producer', `unknown ID ${producerId}`);
  const contributions = activeModifiers(d, s).filter(c => matchesTarget(producer, c.modifier.target));
  return { base: '1', value: resolveStat('1', contributions).toString(), contributions };
}

/** Potential targets include unowned definitions; active targets require ownership and an active source. */
export function modifierTargets(d: DeepReadonly<GameDefinition>, s: DeepReadonly<GameState>, contribution: ModifierContribution): { potential: readonly string[]; active: readonly string[] } {
  const potential = d.producers.filter(p => matchesTarget(p, contribution.modifier.target)).map(p => p.id);
  const isActive = activeModifiers(d, s).some(c => c.sourceId === contribution.sourceId && JSON.stringify(c.modifier) === JSON.stringify(contribution.modifier));
  return { potential, active: isActive ? potential.filter(id => {
    const holding = s.producers[id];
    return holding && quantity(holding.generated).add(holding.purchased).compare('0') > 0;
  }) : [] };
}
