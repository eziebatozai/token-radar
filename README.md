# Token Radar

A token launch radar: it reads a sealed snapshot of DeFi protocols, ranks the
protocols that record no token by what their launch would be worth, and gives
each one a seven-step farm plan.

## The model

Implied value = TVL × peer × growth × maturity × size × chains.

- **Peer** — for the protocol's category, the median market-cap-to-TVL ratio
  of that category's live-token protocols, each ratio clipped to 0.02–2.0,
  shrunk toward the global median with 5 pseudo-observations, capped to
  0.05–1.0. Categories with fewer than 3 live peers take the global median.
  The global median is the median of the live-token ratios inside the
  credible band (0.02, 2.0).
- **Growth** — 1 + the 7-day TVL change (clamped to −50%…+80%) × 0.4 ÷ 100.
- **Maturity** — 0.7 + min(age in days, 1460) ÷ 1460 × 0.3.
- **Size** — TVL in billions to the power −0.07, clamped to 0.75–1.20.
- **Chains** — 1 + 0.02 × min(chain count, 5).

Every multiplier is rounded to 4 decimals before the value is computed, so
the dashboard can recompute any row's value exactly from the multipliers the
row carries. The board ranks the whole 40-protocol watchlist plus every
rankable pre-token protocol below the $50M floor, except bridged products.
Protocols that record a token are never ranked; the 24 largest by market cap
are set aside in the live-token view.

"Records no token" describes the snapshot's record, never proof that a
protocol has no token. The implied value is this radar's own claim, not a
prediction of a launch or a price.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

`--input` is the snapshot file. Without it, the program reads
`MAKEFUN_INPUT_DIR` (a file, or a directory holding `snapshot.json`), else
the default input location. The output directory is `MAKEFUN_OUTPUT_DIR`,
else the default output location. The program needs Node 22 and nothing
else: standard library only, no network, and two runs write the same bytes.

## Files

- `main.ts` — entrypoint: reads the snapshot, writes the bundle.
- `lib/model.ts` — the value model, the board builder, and the farm plans.
- `vendor/makefun-board.ts` — the dossier builder, shipped with the kit.
- `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` — the page.
  It reads its data from `data.js` beside the dashboard directory.
- `screenshots/` — the board view, a detail view, and a filtered view.
- `board.json`, `data.js`, `dossier.json` — written into the output directory
  on each run, not stored in the repository.
