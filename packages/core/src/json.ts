import { ValidationError } from './errors.js';

export type DeepReadonly<T> = T extends readonly (infer V)[] ? readonly DeepReadonly<V>[]
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** Only plain JSON data may cross definition/state boundaries. Reject lossy serialization. */
export function copyData<T>(value: T): T {
  const seen = new Set<object>();
  function visit(input: unknown, path: string): void {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return;
    if (typeof input === 'number' && Number.isFinite(input)) return;
    if (typeof input !== 'object' || input === null) throw new ValidationError(path, 'expected JSON data');
    if (seen.has(input)) throw new ValidationError(path, 'cyclic data');
    const prototype: unknown = Object.getPrototypeOf(input);
    if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null) throw new ValidationError(path, 'class instances are not serializable state');
    if (Object.getOwnPropertySymbols(input).length) throw new ValidationError(path, 'symbol keys are not JSON');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Object.keys(descriptors).filter(key => !(Array.isArray(input) && key === 'length'));
    if (Array.isArray(input) && (keys.length !== input.length || keys.some((key, i) => key !== String(i)))) throw new ValidationError(path, 'sparse arrays and extra array properties are not JSON');
    seen.add(input);
    for (const key of keys) {
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !('value' in descriptor)) throw new ValidationError(`${path}.${key}`, 'accessors and hidden properties are not JSON');
      visit(descriptor.value, `${path}.${key}`);
    }
    seen.delete(input);
  }
  visit(value, '$');
  // JSON.parse returns any in the standard library; the validated roundtrip preserves T.
  return JSON.parse(JSON.stringify(value)) as T;
}

export function freezeData<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
