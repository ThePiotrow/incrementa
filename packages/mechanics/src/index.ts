import { ValidationError } from '@incrementa/core';
import type { GameModule } from '@incrementa/core';
import { GameEngine } from '@incrementa/engine';
import type { GameDefinition, GameState, MechanicActions } from './model.js';
import { createInitialState, parseDefinition, parseGameState } from './validation.js';
import { economyModule } from './economy.js';
import { modifiersModule, productionModule } from './production.js';
import { progressionModule } from './progression.js';
import { equipmentModule } from './equipment.js';

export interface GameOptions {
  /** If omitted, include only modules used by the definition. */
  readonly modules?: readonly GameModule<GameState, GameDefinition>[];
  readonly extensions?: readonly GameModule<GameState, GameDefinition>[];
}

/** Assemble validated JSON or typed content. Custom action catalogs extend typed dispatch. */
export function createGame<CustomActions extends object = object>(content: unknown, options: GameOptions = {}): GameEngine<GameState, GameDefinition, MechanicActions & CustomActions> {
  const definition = parseDefinition(content);
  const required = [economyModule, modifiersModule];
  if (definition.producers.length) required.push(productionModule);
  if (definition.nodes.length || definition.upgrades.length) required.push(progressionModule);
  if (definition.slotGroups.length || definition.collectibles.length) required.push(equipmentModule);
  const modules = [...(options.modules ?? required), ...(options.extensions ?? [])];
  for (const module of required) if (!modules.some(m => m.id === module.id)) throw new ValidationError('modules', `content requires module: ${module.id}`);
  return new GameEngine({ definition, modules, createState: createInitialState, parseState: parseGameState });
}

export { gameDefinitionSchema, gameStateSchema, idSchema, amountSchema, modifierSchema, selectorSchema, buyProducerSchema, acquireNodeSchema, equipSchema, unequipSchema } from './model.js';
export type { GameContent, GameDefinition, GameState, ProducerDefinition, Modifier, Selector, Cost, EntityInstance, MechanicActions } from './model.js';
export { parseDefinition, parseGameState, createInitialState, slotCapacity } from './validation.js';
export { economyModule, canAfford, payCosts, purchaseCosts, sumCosts } from './economy.js';
export { modifiersModule, productionModule, continuousProduction } from './production.js';
export { progressionModule } from './progression.js';
export { equipmentModule } from './equipment.js';
export { activeModifiers, explainProduction, matchesTarget, modifierTargets, resolveStat } from './stats.js';
export type { ModifierContribution, StatExplanation } from './stats.js';
