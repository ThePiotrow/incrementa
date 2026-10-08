import { defineAction, denied, DomainError, quantity } from '@incrementa/core';
import type { GameModule, Quantity, SimulationSystem } from '@incrementa/core';
import { buyProducerSchema } from './model.js';
import type { GameDefinition, GameState } from './model.js';
import { canAfford, payCosts, purchaseCosts } from './economy.js';
import { activeModifiers, matchesTarget, resolveStat } from './stats.js';
import { topologicalOrder } from './validation.js';

const buy = defineAction<GameState, GameDefinition, ReturnType<typeof buyProducerSchema.parse>>({
  id: 'producer.buy', input: buyProducerSchema,
  check: ({ definition, state }, input) => {
    const producer = definition.producers.find(p => p.id === input.producerId);
    if (!producer) return denied('UNKNOWN_PRODUCER', `Unknown producer ${input.producerId}`);
    if (!producer.purchase) return denied('NOT_PURCHASABLE', `Producer ${input.producerId} cannot be purchased`);
    return canAfford(state, purchaseCosts(producer, state.producers[producer.id]!.purchased, input.quantity));
  },
  run: ({ definition, state }, input) => {
    const producer = definition.producers.find(p => p.id === input.producerId)!;
    const holding = state.producers[producer.id]!;
    payCosts(state, purchaseCosts(producer, holding.purchased, input.quantity));
    const purchased = quantity(holding.purchased).add(String(input.quantity));
    // An unrepresentable integral purchase must never charge money without increasing ownership.
    if (purchased.sub(holding.purchased).compare(String(input.quantity)) !== 0) throw new DomainError('QUANTITY_PRECISION', 'Purchase exceeds retained integer precision');
    holding.purchased = purchased.toString();
    return [{ type: 'producer.purchased', data: { producerId: producer.id, quantity: String(input.quantity) } }];
  },
});

/** Integrate the nilpotent linear DAG exactly up to decimal rounding.
 * Polynomial coefficients are in elapsed seconds from the start of this call.
 * Work scales with graph depth/edges, never with aggregate producer quantity.
 */
export const continuousProduction: SimulationSystem<GameState, GameDefinition> = {
  id: 'production.continuous',
  advance: ({ definition: d, state: s }, targetTime) => {
    const seconds = quantity(String(targetTime - s.time)).div('1000');
    const producers = new Map(d.producers.map(p => [p.id, p]));
    const order = topologicalOrder(d.producers.map(p => p.id), d.producers.flatMap(p => p.production.outputs.filter(o => o.target.type === 'producer').map(o => [p.id, o.target.id] as const)), 'producers');
    const polynomials = new Map<string, Quantity[]>(d.producers.map(p => {
      const holding = s.producers[p.id]!;
      return [p.id, [quantity(holding.generated).add(holding.purchased)]];
    }));
    const sources = activeModifiers(d, s);
    for (const id of order) {
      const producer = producers.get(id)!;
      const coefficients = polynomials.get(id)!;
      const multiplier = resolveStat('1', sources.filter(c => matchesTarget(producer, c.modifier.target)));
      for (const output of producer.production.outputs) {
        const rate = quantity(output.amountPerSecondPerUnit).mul(multiplier);
        const integrated = [quantity('0'), ...coefficients.map((coefficient, degree) => coefficient.mul(rate).div(String(degree + 1)))];
        if (output.target.type === 'producer') {
          const target = polynomials.get(output.target.id)!;
          for (let i = 1; i < integrated.length; i++) target[i] = (target[i] ?? quantity('0')).add(integrated[i]!);
        } else {
          s.resources[output.target.id] = quantity(s.resources[output.target.id]!).add(evaluate(integrated, seconds)).toString();
        }
      }
      // Evaluate only the nonconstant terms to avoid losing a small delta to a large initial holding.
      const growth = evaluate([quantity('0'), ...coefficients.slice(1)], seconds);
      s.producers[id]!.generated = quantity(s.producers[id]!.generated).add(growth).toString();
    }
    return [];
  },
};

function evaluate(coefficients: readonly Quantity[], time: Quantity): Quantity {
  let value = quantity('0');
  for (let i = coefficients.length - 1; i >= 0; i--) value = value.mul(time).add(coefficients[i]!);
  return value;
}

export const modifiersModule: GameModule<GameState, GameDefinition> = { id: 'modifiers' };
export const productionModule: GameModule<GameState, GameDefinition> = { id: 'production', dependencies: ['economy', 'modifiers'], actions: [buy], systems: [continuousProduction] };
