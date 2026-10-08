import { DomainError } from './errors.js';
import type { DeepReadonly } from './json.js';

export interface DefinitionIdentity { id: string; rulesVersion: string }
export interface StateIdentity {
  gameId: string;
  rulesVersion: string;
  schemaVersion: number;
  revision: number;
  /** Nonnegative integer milliseconds in the runtime's chosen epoch. */
  time: number;
}
export interface DomainEvent { readonly type: string; readonly data: Readonly<Record<string, string>> }
export interface Transition<S> { readonly state: S; readonly events: readonly DomainEvent[] }
export type Availability = { readonly allowed: true } | { readonly allowed: false; readonly code: string; readonly message: string };
export const allowed: Availability = Object.freeze({ allowed: true });
export const denied = (code: string, message: string): Availability => ({ allowed: false, code, message });

/** Implemented by Zod schemas or small user-defined parsers. Must be synchronous and pure. */
export interface InputSchema<I> { parse(input: unknown): I }
export interface ReadContext<S, D> { readonly state: DeepReadonly<S>; readonly definition: DeepReadonly<D> }
/** State is an isolated transaction draft. It is validated before the engine returns it. */
export interface ActionContext<S, D> { readonly state: S; readonly definition: DeepReadonly<D> }

export interface RegisteredAction<S, D> {
  readonly id: string;
  availability(context: ReadContext<S, D>, input: unknown): Availability;
  execute(context: ActionContext<S, D>, input: unknown): readonly DomainEvent[];
}

/** Shares parsing and authoritative rechecking for explicit and decorated actions. */
export abstract class AbstractGameAction<S, D, I> implements RegisteredAction<S, D> {
  constructor(readonly id: string, readonly input: InputSchema<I>) {}
  protected abstract check(context: ReadContext<S, D>, input: I): Availability;
  protected abstract run(context: ActionContext<S, D>, input: I): readonly DomainEvent[];

  private parse(input: unknown): I {
    try { return this.input.parse(input); }
    catch { throw new DomainError('INVALID_INPUT', `Invalid input for action ${this.id}`); }
  }
  availability(context: ReadContext<S, D>, input: unknown): Availability {
    try { return this.check(context, this.parse(input)); }
    catch (error) {
      if (error instanceof DomainError) return denied(error.code, error.message);
      throw error;
    }
  }
  execute(context: ActionContext<S, D>, input: unknown): readonly DomainEvent[] {
    const parsed = this.parse(input);
    // Check receives the same draft as execution, through its readonly contract.
    const result = this.check({ state: context.state as DeepReadonly<S>, definition: context.definition }, parsed);
    if (!result.allowed) throw new DomainError(result.code, result.message);
    return this.run(context, parsed);
  }
}

export interface ActionDefinition<S, D, I> {
  readonly id: string;
  readonly input: InputSchema<I>;
  readonly check?: (context: ReadContext<S, D>, input: I) => Availability;
  readonly run: (context: ActionContext<S, D>, input: I) => readonly DomainEvent[];
}
export function defineAction<S, D, I>(definition: ActionDefinition<S, D, I>): RegisteredAction<S, D> {
  return new class extends AbstractGameAction<S, D, I> {
    protected check(context: ReadContext<S, D>, input: I): Availability { return definition.check?.(context, input) ?? allowed; }
    protected run(context: ActionContext<S, D>, input: I): readonly DomainEvent[] { return definition.run(context, input); }
  }(definition.id, definition.input);
}

/** Systems execute in topologically sorted module order. Coupled mechanics must share a system. */
export interface SimulationSystem<S, D> {
  readonly id: string;
  advance(context: ActionContext<S, D>, targetTime: number): readonly DomainEvent[];
}
export interface GameModule<S, D> {
  readonly id: string;
  readonly dependencies?: readonly string[];
  readonly actions?: readonly RegisteredAction<S, D>[];
  readonly systems?: readonly SimulationSystem<S, D>[];
  readonly validate?: (definition: DeepReadonly<D>) => void;
}
