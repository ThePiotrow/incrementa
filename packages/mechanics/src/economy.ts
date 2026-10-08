import { allowed, denied, DomainError, quantity, ValidationError } from '@incrementa/core';
import type { Availability, DeepReadonly, GameModule } from '@incrementa/core';
import type { Cost, GameDefinition, GameState, ProducerDefinition } from './model.js';

/** Duplicate resource costs are summed before checking; debit is always all-or-nothing. */
export function sumCosts(costs: readonly DeepReadonly<Cost>[]): Cost[] {
  const totals = new Map<string, string>();
  for (const cost of costs) {
    if (quantity(cost.amount).compare('0') < 0) throw new ValidationError('cost.amount', 'must be nonnegative');
    totals.set(cost.resourceId, quantity(totals.get(cost.resourceId) ?? '0').add(cost.amount).toString());
  }
  return [...totals].map(([resourceId, amount]) => ({ resourceId, amount }));
}

export function canAfford(state: DeepReadonly<GameState>, costs: readonly DeepReadonly<Cost>[]): Availability {
  for (const cost of sumCosts(costs)) {
    if (!Object.hasOwn(state.resources, cost.resourceId)) throw new ValidationError('cost.resourceId', `unknown resource ${cost.resourceId}`);
    if (quantity(state.resources[cost.resourceId] ?? '0').compare(cost.amount) < 0) return denied('INSUFFICIENT_RESOURCES', `Not enough ${cost.resourceId}`);
  }
  return allowed;
}
export function payCosts(state: GameState, costs: readonly DeepReadonly<Cost>[]): void {
  const result = canAfford(state, costs);
  if (!result.allowed) throw new DomainError(result.code, result.message);
  for (const cost of sumCosts(costs)) state.resources[cost.resourceId] = quantity(state.resources[cost.resourceId] ?? '0').sub(cost.amount).toString();
}

/** O(log quantity) geometric sum without cancellation near factor=1. */
function geometricSum(factor: string, count: number): string {
  let length = count;
  let blockPower = quantity(factor);
  let blockSum = quantity('1');
  let totalPower = quantity('1');
  let totalSum = quantity('0');
  while (length > 0) {
    if (length % 2 === 1) {
      totalSum = totalSum.add(totalPower.mul(blockSum));
      totalPower = totalPower.mul(blockPower);
    }
    length = Math.floor(length / 2);
    if (length > 0) {
      blockSum = blockSum.mul(blockPower.add('1'));
      blockPower = blockPower.mul(blockPower);
    }
  }
  return totalSum.toString();
}

export function purchaseCosts(producer: DeepReadonly<ProducerDefinition>, purchased: string, count: number): Cost[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) throw new DomainError('INVALID_INPUT', 'Purchase quantity must be an integer from 1 to 1000000');
  if (!quantity(purchased).isInteger || quantity(purchased).compare('0') < 0) throw new ValidationError('purchased', 'expected a nonnegative integral quantity');
  if (!producer.purchase) throw new DomainError('NOT_PURCHASABLE', `Producer ${producer.id} cannot be purchased`);
  const factor = producer.purchase.scaling.factor;
  const scale = quantity(factor).pow(purchased).mul(geometricSum(factor, count));
  return sumCosts(producer.purchase.costs.map(cost => ({ resourceId: cost.resourceId, amount: quantity(cost.amount).mul(scale).toString() })));
}

export const economyModule: GameModule<GameState, GameDefinition> = { id: 'economy' };
