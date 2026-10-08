import assert from 'node:assert/strict';
import { quantity } from '@incrementa/core';
import { factoryContent } from '../examples/factory/dist/content.js';

export const factory = () => structuredClone(factoryContent);
export const code = expected => error => { assert.equal(error.code, expected); return true; };
export function near(actual, expected, relative = '1e-45') {
  const difference = quantity(actual).sub(expected);
  const absolute = difference.compare('0') < 0 ? difference.mul('-1') : difference;
  const magnitude = quantity(expected).compare('1') < 0 ? quantity('1') : quantity(expected);
  assert.ok(absolute.compare(magnitude.mul(relative)) <= 0, `${actual} differs from ${expected}`);
}
