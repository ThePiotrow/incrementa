import { copyData, ValidationError } from '@incrementa/core';
import type { DefinitionIdentity, StateIdentity, Transition } from '@incrementa/core';
import type { GameEngine } from '@incrementa/engine';

export interface Clock { now(): number }
/** Runtime-only wall clock; deterministic engines never read it. */
export class SystemClock implements Clock { now(): number { return Date.now(); } }

/** Single-writer storage. No concurrency, idempotency, or server authority is implied. */
export interface GameRepository {
  load(key: string): Promise<string | undefined>;
  save(key: string, serialized: string): Promise<void>;
}
export class MemoryGameRepository implements GameRepository {
  private readonly saves = new Map<string, string>();
  async load(key: string): Promise<string | undefined> { return this.saves.get(key); }
  async save(key: string, serialized: string): Promise<void> { this.saves.set(key, serialized); }
}

/** Framework version describes the writer; schema and rules compatibility are checked separately. */
export function serializeState<S extends StateIdentity, D extends DefinitionIdentity, A extends object>(engine: GameEngine<S, D, A>, state: S): string {
  return JSON.stringify({ formatVersion: 1, frameworkVersion: '0.1.0', state: engine.parseState(state) });
}
export function deserializeState<S extends StateIdentity, D extends DefinitionIdentity, A extends object>(engine: GameEngine<S, D, A>, serialized: string): S {
  let envelope: unknown;
  try { envelope = JSON.parse(serialized); }
  catch { throw new ValidationError('save', 'malformed JSON'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || !('formatVersion' in envelope) || envelope.formatVersion !== 1
    || !('frameworkVersion' in envelope) || typeof envelope.frameworkVersion !== 'string'
    || !('state' in envelope) || Object.keys(envelope).length !== 3) throw new ValidationError('save', 'unsupported save envelope');
  return engine.parseState(envelope.state);
}

export interface LocalRuntimeOptions<S extends StateIdentity, D extends DefinitionIdentity, A extends object> {
  readonly engine: GameEngine<S, D, A>;
  readonly clock: Clock;
  readonly repository: GameRepository;
  readonly key: string;
}

/** One runtime owns one local save. Calls are serialized and a failed write never installs a draft. */
export class LocalRuntime<S extends StateIdentity, D extends DefinitionIdentity, A extends object> {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(private readonly options: LocalRuntimeOptions<S, D, A>, private state: S) {}

  static async open<S extends StateIdentity, D extends DefinitionIdentity, A extends object>(options: LocalRuntimeOptions<S, D, A>): Promise<LocalRuntime<S, D, A>> {
    const serialized = await options.repository.load(options.key);
    const state = serialized === undefined ? options.engine.createState(options.clock.now()) : deserializeState(options.engine, serialized);
    const runtime = new LocalRuntime({ ...options }, state);
    await runtime.advance();
    return runtime;
  }

  get snapshot(): S { return copyData(this.state); }

  private enqueue(operation: () => Transition<S>): Promise<Transition<S>> {
    const result = this.queue.then(async () => {
      const transition = operation();
      await this.options.repository.save(this.options.key, serializeState(this.options.engine, transition.state));
      this.state = copyData(transition.state);
      return transition;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  advance(): Promise<Transition<S>> {
    return this.enqueue(() => this.options.engine.advanceTo(this.state, this.options.clock.now()));
  }

  dispatch<K extends keyof A & string>(id: K, input: A[K]): Promise<Transition<S>> {
    const captured = copyData(input);
    return this.enqueue(() => this.options.engine.dispatch(this.state, id, captured, this.options.clock.now()));
  }
}
