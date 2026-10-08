import { defineAction, ValidationError } from '@incrementa/core';
import type { ActionContext, Availability, DomainEvent, GameModule, InputSchema, ReadContext, RegisteredAction } from '@incrementa/core';

// Metadata is attached only to declarations; there is no process-wide action registry.
const actionMetadata = Symbol('incrementa.action');
const extensionMetadata = Symbol('incrementa.extension');
interface ExtensionOptions { readonly id: string; readonly dependencies?: readonly string[] }

export function GameExtension(options: ExtensionOptions) {
  return <T extends abstract new (...args: never[]) => object>(target: T, _context: ClassDecoratorContext<T>): void => {
    Object.defineProperty(target, extensionMetadata, { value: Object.freeze({ ...options, dependencies: Object.freeze([...(options.dependencies ?? [])]) }) });
  };
}

export interface ActionOptions<S, D, I> {
  readonly id: string;
  readonly input: InputSchema<I>;
  readonly check?: (context: ReadContext<S, D>, input: I) => Availability;
}

/** Standard ECMAScript method decorator. Public instance methods only. */
export function Action<S, D, I>(options: ActionOptions<S, D, I>) {
  const metadata = { ...options };
  return <T extends object>(method: (this: T, context: ActionContext<S, D>, input: I) => readonly DomainEvent[], context: ClassMethodDecoratorContext<T, typeof method>): void => {
    if (context.private || context.static) throw new ValidationError('decorator', 'actions require public instance methods');
    if (Object.hasOwn(method, actionMetadata)) throw new ValidationError('decorator', 'one action decorator per method');
    const factory = (instance: T): RegisteredAction<S, D> => defineAction({
      ...metadata,
      run: (ctx, input) => method.call(instance, ctx, input),
    });
    Object.defineProperty(method, actionMetadata, { value: factory });
  };
}

/** Create a normal module from one explicitly supplied instance.
 * Inherited methods retain binding; decorated overrides replace base metadata.
 * An undecorated override of a decorated method is rejected to prevent hidden actions.
 * S and D must match the context types used by this extension's methods.
 */
export function decoratedModule<S, D>(instance: object): GameModule<S, D> {
  const constructor: unknown = instance.constructor;
  if (typeof constructor !== 'function' || !Object.hasOwn(constructor, extensionMetadata)) throw new ValidationError('decorator', 'class must declare @GameExtension');
  // These symbol properties are written exclusively by the typed decorators above.
  const options = Reflect.get(constructor, extensionMetadata) as ExtensionOptions;
  const methods = new Map<PropertyKey, boolean>();
  const actions: RegisteredAction<S, D>[] = [];
  let prototype: object | null = instance;
  while (prototype && prototype !== Object.prototype) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (key === 'constructor') continue;
      const value: unknown = Object.getOwnPropertyDescriptor(prototype, key)?.value;
      const decorated = typeof value === 'function' && Object.hasOwn(value, actionMetadata);
      if (methods.has(key)) {
        if (decorated && !methods.get(key)) throw new ValidationError('decorator', `undecorated override: ${String(key)}`);
        continue;
      }
      methods.set(key, decorated);
      if (decorated) {
        const factory = Reflect.get(value as object, actionMetadata) as (receiver: object) => RegisteredAction<S, D>;
        actions.push(factory(instance));
      }
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return { ...options, actions };
}
