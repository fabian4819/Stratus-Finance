# ATS integration friction log

Running log of friction encountered integrating `@hashgraph/asset-tokenization-sdk`
/ `hashgraph/asset-tokenization-studio`, kept as it happens during Phase 0–3.
The best entry here becomes the upstream issue/PR referenced in PLAN.md §8
(bonus criterion: "Contributions back upstream to ATS"). File it by end of
Phase 3, not the night before the deadline.

Format per entry: what we tried, what happened, what upstream could do
better, and whether we filed anything.

---

## Research-stage findings (pre-Phase-0), not yet friction

These aren't problems, just things confirmed by reading source that weren't
obvious from the README alone — recorded here so Phase 0/1 doesn't
re-derive them:

- The SDK's own README (`packages/ats/sdk/README.md`) doesn't show a code
  sample for the "Deploy a new Equity" use case beyond "Use the
  `Equity.Create` method" — the actual parameter object shape had to be
  cross-referenced from the `Bond.create` / `Equity.create` **Input Ports**
  sections above it. A worked TypeScript example in the use-cases section
  would have saved real time; consider this the first upstream docs PR
  candidate.
- ATS assets are EIP-2535 diamonds, not single contracts — confirmed via
  `packages/ats/contracts/contracts/facets/`. The `core`, `allowance`, and
  `transfer` facets do implement a standard ERC-20 surface (`approve`,
  `transferFrom`, `balanceOf`, `Transfer`/`Approval` events), so plain
  `IERC20` calls from Aave v2 should work — this was not obvious from the
  SDK README, which documents the SDK-mediated flows (`Security.issue`,
  `Security.transfer`) far more prominently than the underlying ERC-20
  compatibility. See PLAN.md §6.2.

## Entries

_(none yet — fill in during Phase 0/1)_

Template:

```
### YYYY-MM-DD — <short title>

**Tried:** ...
**Result:** ...
**Upstream gap:** ...
**Filed:** <issue/PR link, or "not yet">
```
