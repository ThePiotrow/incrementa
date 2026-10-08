import { quantity } from '@incrementa/core';
import type { ActionContext } from '@incrementa/core';
import { Action, GameExtension } from '@incrementa/decorators';
import type { GameDefinition, GameState } from '@incrementa/mechanics';

export interface FactoryActionsCatalog { 'factory.gather': { amount: string } }
export const gatherInput = {
  parse(value: unknown): { amount: string } {
    if (!value || typeof value !== 'object' || !('amount' in value) || typeof value.amount !== 'string'
      || Object.keys(value).length !== 1 || quantity(value.amount).compare('0') <= 0 || quantity(value.amount).compare('10') > 0) throw new Error('amount must be a decimal string in (0, 10]');
    return { amount: value.amount };
  },
};

@GameExtension({ id: 'factory-actions', dependencies: ['economy'] })
export class FactoryActions {
  constructor(private readonly resourceId = 'coins') {}

  @Action({ id: 'factory.gather', input: gatherInput })
  gather({ state }: ActionContext<GameState, GameDefinition>, input: { amount: string }) {
    state.resources[this.resourceId] = quantity(state.resources[this.resourceId] ?? '0').add(input.amount).toString();
    return [{ type: 'factory.gathered', data: { amount: input.amount } }];
  }
}
