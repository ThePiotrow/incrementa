import test from 'node:test';
import assert from 'node:assert/strict';
import { quantity, copyData, ValidationError } from '@incrementa/core';

test('decimal arithmetic retains large fractional values without native number conversion', () => {
  assert.equal(quantity('9007199254740993.25').add('0.25').toString(), '9007199254740993.5');
  assert.equal(quantity('1e400').mul('1.25').toString(), '1.25e+400');
  assert.equal(quantity('1').div('8').toString(), '0.125');
  assert.equal(quantity('1e400').add('1').toString(), '1e+400'); // documented finite precision
});

test('invalid quantities, overflow, division by zero and underflow reject explicitly', () => {
  for (const invalid of ['NaN', 'Infinity', '-Infinity', ' 1', '0x10', '', '1e1000001', '1e-1000001']) assert.throws(() => quantity(invalid), ValidationError);
  assert.throws(() => quantity('1').div('0'), /division by zero/);
  assert.throws(() => quantity('1e1000000').mul('10'), /overflow/);
  assert.throws(() => quantity('1e-1000000').div('10'), /underflow/);
  assert.throws(() => quantity('1e-1000000').mul('0.1'), /underflow/);
  assert.throws(() => quantity('1.1e-1000000').sub('1e-1000000'), /underflow/);
  assert.throws(() => quantity('1.1e-1000000').add('-1e-1000000'), /underflow/);
});

test('half-even input rounding is explicit at the fiftieth significant digit', () => {
  const even = '1.' + '0'.repeat(48) + '2';
  const odd = '1.' + '0'.repeat(48) + '3';
  assert.equal(quantity(even + '5').toString(), even);
  assert.equal(quantity(odd + '5').toString(), '1.' + '0'.repeat(48) + '4');
});

test('JSON boundaries reject class instances, nonfinite values and cyclic or callback state', () => {
  const cycle = {}; cycle.self = cycle;
  for (const invalid of [new Date(), { n: NaN }, { n: undefined }, { callback() {} }, { n: 1n }, cycle, Array(2), { get property() { throw new Error('should not invoke getter'); } }, Object.defineProperty({}, 'hidden', { value: 1 })]) assert.throws(() => copyData(invalid), ValidationError);
});
