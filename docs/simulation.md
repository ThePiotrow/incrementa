# Numbers and simulation

Every economic calculation uses `Quantity`, an immutable wrapper around a private decimal.js constructor. Precision is **50 significant decimal digits**, with **round-half-even** on input normalization and arithmetic. Accepted nonzero magnitudes have decimal exponents from **−1,000,000 to +1,000,000**. Decimal/scientific strings are limited to 2,048 characters; `NaN`, infinity, hexadecimal, whitespace, and native numeric quantities are rejected. Nonzero underflow, overflow and division by zero throw `ValidationError`. A failed numeric operation never returns a partially applied engine transition.

State stores canonical decimal strings. Costs, balances, rates and modifier values share this representation. No conversion through a JavaScript number occurs for economic arithmetic. Numbers are used only for bounded metadata: safe-integer milliseconds/revisions, purchase batch counts, slot indices/capacities and array degrees. Decimal elapsed seconds come from the safe-integer millisecond difference divided by 1,000.

Balances, generated holdings and rates may be fractional. Purchased counts must be integral; actions accept integer purchase batches from 1 to 1,000,000. Purchasing fails with `QUANTITY_PRECISION` if the exact integer increment cannot be retained. There is no currency-cent rounding or resource cap. Negative balances/rates/modifier values are rejected by the standard schemas; the arithmetic wrapper itself supports negative intermediates for subtraction and comparisons.

Precision is bounded, not arbitrary exactness: adding `1` to `1e400` has no effect. A cost far below a balance's retained precision may likewise leave the stored balance unchanged. Extremely large purchased counts may be unable to represent another small purchase. Choose currency scales/rules appropriate to the retained precision; this model does not claim exact accounting for every tiny transaction at unlimited magnitude. Input normalization can round away digits beyond the fiftieth.

Geometric costs use exponentiation for prior purchase history and a binary geometric sum for a batch, avoiding cancellation from `(factor^n - 1)/(factor - 1)` near factor 1. Runtime grows logarithmically with batch size. Factor 1 is supported; factors below 1 are rejected.

Production supports nonnegative, **linear continuous acyclic graphs** with aggregate fractional producer holdings. A producer's outgoing rate equals its current total holdings × output rate × resolved output multiplier. Multipliers remain constant during an advance interval. Producer creation is continuous, not integer spawning.

For A creating B at constant rate `r`, and B producing C at rate `p` per unit:

```text
B(t) = B₀ + r t
ΔC   = p B₀ t + p r t² / 2
```

The implementation visits a topological order, integrates polynomial coefficients along each edge, and evaluates each resulting polynomial at elapsed seconds. Branching, merging, multiple outputs, and longer DAGs are supported. All cycles, including zero-rate cycles, are rejected. Work scales with graph edges/depth and active sources, never with the number of owned producers. Extremely deep/dense definitions still cost more work; this is not a constant-time arbitrary graph simulator.

Calling once or many times should give equivalent economic results subject to decimal rounding. Constant and simple two-stage examples in the tests match exactly. Higher-degree polynomial division may be inexact; thirty deterministic irregular partitions of a branched cubic case are checked at relative tolerance `1e-45` (absolute `1e-45` for magnitudes below one). This is a regression tolerance, not a universal error bound for arbitrarily long runs. Revision counts intentionally differ with the number of successful transitions.

Time is nonnegative safe-integer milliseconds. Backward time returns `TIME_REVERSED`. An advance to the same timestamp is a no-op without a revision increment. An action at timestamp T first integrates the old rules to T, then buys/equips/acquires at T. The next interval sees its new modifiers. Equal-time actions run in caller order. Newly acquired bonuses never apply retroactively.

The engine does not use wall time, ticks, randomness, per-unit timers, or elapsed-time truncation. Temporary boosts/expiry, input consumption, resource depletion, caps, discrete recipes and cycles are deliberately deferred. They need explicit boundary orchestration or a separately defined simulator; introducing a render-dependent timestep would change the model.
