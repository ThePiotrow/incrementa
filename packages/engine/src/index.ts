import { copyData, freezeData, DomainError, ValidationError } from '@incrementa/core';
import type { Availability, DeepReadonly, DefinitionIdentity, DomainEvent, GameModule, RegisteredAction, SimulationSystem, StateIdentity, Transition } from '@incrementa/core';

export interface EngineOptions<S extends StateIdentity, D extends DefinitionIdentity> {
  readonly definition: D;
  readonly modules: readonly GameModule<S, D>[];
  readonly createState: (definition: DeepReadonly<D>, time: number) => S;
  /** Validate shape, versions, references, and invariants; return an independent state. */
  readonly parseState: (input: unknown, definition: DeepReadonly<D>) => S;
}

function time(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError('time', 'expected nonnegative safe integer milliseconds');
}

function actionInput(input: unknown): unknown {
  try { return copyData(input); }
  catch { throw new DomainError('INVALID_INPUT', 'Action input must be JSON data'); }
}

/** Stateless deterministic executor. Catalog maps public action IDs to validated input types. */
export class GameEngine<S extends StateIdentity, D extends DefinitionIdentity, Catalog extends object = Record<string, unknown>> {
  readonly definition: DeepReadonly<D>;
  readonly moduleIds: readonly string[];
  private readonly actions = new Map<string, RegisteredAction<S, D>>();
  private readonly systems: SimulationSystem<S, D>[] = [];
  private readonly options: EngineOptions<S, D>;

  constructor(options: EngineOptions<S, D>) {
    this.options = { ...options };
    this.definition = freezeData(copyData(options.definition));
    const modules = new Map<string, GameModule<S, D>>();
    for (const module of options.modules) {
      if (!module.id || modules.has(module.id)) throw new ValidationError('modules', `duplicate or empty module ID: ${module.id}`);
      modules.set(module.id, module);
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const systemIds = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new ValidationError('modules', `dependency cycle at ${id}`);
      const module = modules.get(id);
      if (!module) throw new ValidationError('modules', `missing dependency: ${id}`);
      visiting.add(id);
      for (const dependency of module.dependencies ?? []) visit(dependency);
      module.validate?.(this.definition);
      for (const action of module.actions ?? []) {
        if (!action.id || this.actions.has(action.id)) throw new ValidationError('actions', `duplicate or empty action ID: ${action.id}`);
        this.actions.set(action.id, action);
      }
      for (const system of module.systems ?? []) {
        if (!system.id || systemIds.has(system.id)) throw new ValidationError('systems', `duplicate or empty system ID: ${system.id}`);
        systemIds.add(system.id);
        this.systems.push(system);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of modules.keys()) visit(id);
    this.moduleIds = Object.freeze([...visited]);
  }

  createState(at = 0): S {
    time(at);
    return this.parseState(this.options.createState(this.definition, at));
  }

  parseState(input: unknown): S {
    const state = copyData(this.options.parseState(copyData(input), this.definition));
    if (state.gameId !== this.definition.id || state.rulesVersion !== this.definition.rulesVersion) throw new ValidationError('state', 'game/rules version mismatch');
    time(state.time);
    if (!Number.isSafeInteger(state.revision) || state.revision < 0) throw new ValidationError('state.revision', 'expected nonnegative safe integer');
    return state;
  }

  private action(id: string): RegisteredAction<S, D> {
    const action = this.actions.get(id);
    if (!action) throw new DomainError('UNKNOWN_ACTION', `Unknown action: ${id}`);
    return action;
  }

  availability<K extends keyof Catalog & string>(state: S, id: K, input: Catalog[K], at = state.time): Availability {
    return this.availabilityUnknown(state, id, input, at);
  }

  availabilityUnknown(state: S, id: string, input: unknown, at = state.time): Availability {
    try {
      const advanced = this.advanceTo(state, at).state;
      return this.action(id).availability({ state: freezeData(advanced), definition: this.definition }, actionInput(input));
    } catch (error) {
      if (error instanceof DomainError) return { allowed: false, code: error.code, message: error.message };
      throw error;
    }
  }

  private advanceDraft(state: S, at: number): readonly DomainEvent[] {
    time(at);
    if (at < state.time) throw new DomainError('TIME_REVERSED', 'Cannot simulate backwards');
    if (at === state.time) return [];
    const events = this.systems.flatMap(system => [...system.advance({ state, definition: this.definition }, at)]);
    state.time = at;
    return events;
  }

  private finish(state: S, revision: number, events: readonly DomainEvent[]): Transition<S> {
    state.revision = revision + 1;
    return { state: this.parseState(state), events: freezeData(copyData(events)) };
  }

  advanceTo(input: S, at: number): Transition<S> {
    const state = this.parseState(input);
    const events = this.advanceDraft(state, at);
    return at === input.time ? { state, events } : this.finish(state, input.revision, events);
  }

  dispatch<K extends keyof Catalog & string>(state: S, id: K, input: Catalog[K], at = state.time): Transition<S> {
    return this.dispatchUnknown(state, id, input, at);
  }

  /** External transports use this path; it still parses input and rechecks preconditions.
   * Advances with OLD modifiers, then executes. Any failure discards the entire draft.
   */
  dispatchUnknown(inputState: S, id: string, input: unknown, at = inputState.time): Transition<S> {
    const action = this.action(id);
    const state = this.parseState(inputState);
    const events = [...this.advanceDraft(state, at), ...action.execute({ state, definition: this.definition }, actionInput(input))];
    if (state.time !== at) throw new ValidationError('action', 'actions must not change simulation time');
    return this.finish(state, inputState.revision, events);
  }
}
