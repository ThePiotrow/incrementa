export { Quantity, quantity } from './quantity.js';
export { DomainError, ValidationError } from './errors.js';
export { copyData, freezeData, type DeepReadonly } from './json.js';
export { AbstractGameAction, defineAction, allowed, denied } from './contracts.js';
export type { DefinitionIdentity, StateIdentity, DomainEvent, Transition, Availability, InputSchema, ReadContext, ActionContext, RegisteredAction, ActionDefinition, SimulationSystem, GameModule } from './contracts.js';
