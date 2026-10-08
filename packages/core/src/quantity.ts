import { Decimal } from 'decimal.js';
import { ValidationError } from './errors.js';

// Private clone: consumers cannot change the arithmetic policy through Decimal.set.
const Arithmetic = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_EVEN, maxE: 1_000_000, minE: -1_000_000 });
const literal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i;

/** Immutable decimal arithmetic, 50 significant digits, half-even rounding.
 * Values outside ±1e1,000,000 (or nonzero below 1e-1,000,000) are rejected.
 */
export class Quantity {
  private constructor(private readonly value: Decimal) {}

  static from(value: string | Quantity): Quantity {
    if (value instanceof Quantity) return value;
    if (typeof value !== 'string' || value.length > 2048 || !literal.test(value)) {
      throw new ValidationError('quantity', 'expected a decimal string (at most 2048 characters)');
    }
    const parsed = new Arithmetic(value);
    if (!parsed.isFinite() || (parsed.isZero() && /[1-9]/.test(value.split(/e/i)[0] ?? ''))) {
      throw new ValidationError('quantity', 'outside supported exponent range');
    }
    return Quantity.checked(parsed.toSignificantDigits(50));
  }

  private static checked(value: Decimal): Quantity {
    if (!value.isFinite()) throw new ValidationError('quantity', 'numeric overflow or division by zero');
    return new Quantity(value);
  }

  add(other: string | Quantity): Quantity {
    const right = Quantity.from(other).value;
    const result = this.value.add(right);
    if (result.isZero() && !this.value.equals(right.negated())) throw new ValidationError('quantity', 'numeric underflow');
    return Quantity.checked(result);
  }
  sub(other: string | Quantity): Quantity {
    const right = Quantity.from(other).value;
    const result = this.value.sub(right);
    if (result.isZero() && !this.value.equals(right)) throw new ValidationError('quantity', 'numeric underflow');
    return Quantity.checked(result);
  }
  mul(other: string | Quantity): Quantity {
    const right = Quantity.from(other).value;
    const result = this.value.mul(right);
    if (result.isZero() && !this.value.isZero() && !right.isZero()) throw new ValidationError('quantity', 'numeric underflow');
    return Quantity.checked(result);
  }
  div(other: string | Quantity): Quantity {
    const right = Quantity.from(other).value;
    if (right.isZero()) throw new ValidationError('quantity', 'division by zero');
    const result = this.value.div(right);
    if (result.isZero() && !this.value.isZero()) throw new ValidationError('quantity', 'numeric underflow');
    return Quantity.checked(result);
  }
  pow(exponent: string | Quantity): Quantity {
    const result = this.value.pow(Quantity.from(exponent).value);
    if (result.isZero() && !this.value.isZero()) throw new ValidationError('quantity', 'numeric underflow');
    return Quantity.checked(result);
  }
  compare(other: string | Quantity): number { return this.value.comparedTo(Quantity.from(other).value); }
  get isInteger(): boolean { return this.value.isInteger(); }
  toString(): string { return this.value.toString(); }
  toJSON(): string { return this.toString(); }
}

export const quantity = (value: string | Quantity): Quantity => Quantity.from(value);
