# sim-compare — cross-engine solver comparison

Runs the same races through **our** `uma-skill-tools` and through **upstream**
[`alpha123/uma-skill-tools`](https://github.com/alpha123/uma-skill-tools), using each
engine's own `tools/gain.ts`, and checks that the バ身-gain distributions agree.

Our engine has diverged from upstream (via kachi-dev, plus our own condition tokens, HP
work and Conserve Power support). This harness answers: *are those changes behaving, or
have we quietly drifted away from the reference implementation?*

```bash
bash tools/sim-compare/setup.sh                  # clone + npm install upstream (once)
node tools/sim-compare/compare-sims.mjs          # run the corpus
```

Exit code is 0 when every engine-comparable case passes, 1 otherwise — it is CI-able.

## Why the comparison is statistical, not exact

The two engines do not share a random number generator. Upstream uses `Rule30CARng`, a
cellular-automaton PRNG; our fork replaced it with Prando and kept the old name as an
alias (`uma-skill-tools/Random.ts`). Same seed, completely different stream. Bit-identical
seed-matched comparison is therefore impossible, no matter what you pass to `--seed`.

So the harness pools a large number of samples per engine and compares the **means**,
which are unbiased regardless of which PRNG produced them. A case passes when

```
|mean_ours - mean_alpha|  <=  max(--tol-abs, --tol-sigma * combined standard error)
```

The absolute term (default 0.05 バ身) is the practical-significance floor: at large sample
counts the standard error shrinks to almost nothing, and without a floor every case would
eventually "fail" on a difference far too small to matter. The sigma term (default 3)
keeps noisy, low-sample runs from failing spuriously.

## Reading the output

| Column | Meaning |
|---|---|
| `ours` / `alpha` | mean gain in バ身, pooled over all seeds |
| `Δ` | `mean_ours - mean_alpha` — the number that actually matters |
| `z` | Δ in units of combined standard error; how confident we are Δ is real |
| `tol` | the pass threshold for this case |
| `KS` | two-sample Kolmogorov–Smirnov statistic — distribution shape, informational only |

Tags after the verdict:

- **`(data)`** — the skill or course definition differs between the two engines' `data/`
  directories, so a mismatch is a *data* difference, not an engine bug. Excluded from the
  exit code unless you pass `--strict`.
- **`(no-op)`** — the skill never fired in either engine, so agreement proves nothing.

`KS` and the reported spread ratio will always look bad, and that is expected — see below.

## The upstream RNG patch

`setup.sh` applies `upstream-rng-warmup.patch` to the checkout. This is not cosmetic — the
comparison is meaningless without it.

Upstream's `Rule30CARng.pair()` samples its output bits out of the **high** word of the
generator state, and every CLI entry point in that repo constructs the generator with only
a low seed, leaving the high word at its `0` default. The first several `random()` calls
then return exactly `0`. Concretely, upstream's baseline CLI race has a zero start delay
and the *minimum* per-section speed modifier in all 24 sections, identically for every
`--seed`:

```
seed 11 finish 96.5333 targetv: 19.9651 19.9651 19.3247 19.7151 ...
seed 22 finish 96.5333 targetv: 19.9651 19.9651 19.3247 19.7151 ...
seed 33 finish 96.5333 targetv: 19.9651 19.9651 19.3247 19.7151 ...
```

Every seed, byte for byte. Since the per-section modifier has a positive mean, pinning it
to its floor makes upstream's baseline race systematically *slower* than the model
intends — 0.15s over 2000m, 0.74s over 3000m — which shifts every gain measured against
it. The patch runs 64 `step()`s in the constructor to diffuse the seed. Afterwards
upstream's races vary by seed and its 2000m baseline agrees with ours to within
0.009s ± 0.015 (z = −0.65).

Our fork is unaffected: it replaced this generator with Prando, which takes a single seed
word and has no warm-up problem.

## Known structural differences (not bugs to chase)

**Position keep.** Upstream models it as an always-on pace down (`posKeepSpeedCoef` 0.945
or 0.915) for anything that isn't nige. We implement the in-game state machine
(speed up / overtake / pace up / pace down, with real entry and exit conditions, ending at
section 10). Ours is the more faithful model, so the two will never agree exactly on
non-nige strategies. Note that our `gain.ts` runs `--pos-keep-mode none` by default, which
is why this does not currently dominate the comparison — see the warning in that flag's
help text.

**Deterministic cases show `sd == 0` in both engines.** Any skill on `ImmediatePolicy`
produces exactly the same race every sample once both solvers are paired on one seed. The
spread-ratio summary excludes these, and `z` is reported as 0 rather than exploding on
float noise.

**Recovery skills measure zero.** `gain.ts` runs `NoopHpPolicy`, so type-9 effects have
nothing to act on. `control/recovery-inert/*` exists to pin that down: if it ever stops
reading 0, an engine started simulating HP here.

## The corpus

`cases.json`. Every skill and course in it was chosen to be present in *both* engines'
`data/` with a semantically identical definition, so failures point at engine code rather
than at our JP data being stale. `compare-sims.mjs` re-verifies this at run time and tags
anything that has since drifted.

Coverage spans the sample-policy space (immediate, `*_random`, `accumulatetime`
distributions, the alternatives/`@` fallback path, and the debuff path that `gain.ts`
splits onto a separate solver), four running styles, turf and dirt, sprint through 3000m,
plus ground and mood variations.

Each case carries a `_why` explaining what it is there to catch. Add cases the same way:

```json
{ "id": "family/what/horse-course", "_why": "...", "horse": "senkou", "course": 10504, "skills": [100271] }
```

`horse` names a file in `horses/` (copies of the upstream strategy presets, kept here so
both engines read byte-identical input). Optional per-case `ground`, `mood`, `timestep`.

## Options

```
--cases <file>      case corpus (default cases.json)
--ours <dir>        our engine checkout (default uma-skill-tools/)
--alpha <dir>       upstream checkout (default ./alpha, created by setup.sh)
-N, --samples <n>   gain.ts samples per run (default 2000)
--repeats <r>       independent seeds per case per engine (default 3)
--seed <n>          base seed (default 20260805)
-j, --jobs <n>      parallel gain.ts processes (default cpus-2)
--tol-abs <bashin>  practical-significance tolerance (default 0.05)
--tol-sigma <k>     noise tolerance in combined standard errors (default 3)
--filter <substr>   only run cases whose id contains <substr>
--json <file>       write the full machine-readable report
--strict            also fail on data-divergent cases
--list              print the corpus and exit
--quiet             summary only
```

Both engines run under `ts-node --transpile-only`. This was verified to produce output
identical to a type-checked run on both sides; it is roughly 2× faster, which matters when
a full pass is ~120 processes.

## Notes

- `alpha/` and `out/` are gitignored. Re-run `setup.sh` to refresh upstream and re-apply
  the RNG patch (the apply step is idempotent).
- A full default run is ~80s on 14 jobs. For a quick check:
  `--samples 300 --repeats 1` finishes in ~7s but only resolves differences above
  roughly 0.15 バ身.
- To chase a single failing case:
  `--filter random/all-corner --samples 8000 --repeats 5 --json out/one.json`
