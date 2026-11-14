# Token Launch Radar — radar-2

A token launch radar for make.fun `token-radar-01`: read the sealed DefiLlama
snapshot, rank every pre-token protocol by implied value, and hand in a
dashboard a reader can use to farm it.

## Model (radar-2, comparables)

Implied value follows only from the snapshot's own figures, by category
comparables — no protocol name is ever special-cased:

```
peer       = category median market-cap / TVL among the snapshot's live-token
             protocols (ratio clipped to [0.02, 2.0], shrunk toward the global
             median by 5 pseudo-observations, capped to [0.05, 1.0])
implied    = round( tvl_usd x peer
             x (1 + clamp(change_7d, -50, 80) / 100 x 0.4)
             x (0.7 + min(age_days, 1460) / 1460 x 0.3)
             x clamp((tvl_usd / 1e9) ^ -0.07, 0.75, 1.20)
             x (1 + 0.02 x min(chains, 5)) )
```

Every multiplier is rounded to 4 decimals before the implied value is
computed, and board.json carries those rounded figures — the dashboard
recomputes each row from them alone, so its number always equals the board's
to the dollar (verified for all 226 rows).

A lending protocol is not priced like a bridge: the market pays different
multiples per category (Lending 0.13, Dexs 0.34, Liquid Staking 0.04,
Bridge ~0.99 in this snapshot), and the snapshot itself says what they are.

## Board

- 226 rows: all 40 watchlist protocols, plus every rankable pre-token
  protocol below the $50M floor (186 early rows)
- 24 live-token protocols set aside with their market caps, never mixed
  into the ranking
- 7-step farm plan per protocol: fresh wallet, the category action with
  capital and gas, points/quests join, weekly qualifying action, hold
  window, safe claim, farm log — each step states its cost and time

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only, no network. Deterministic: two runs write
byte-identical output. Writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to the output directory.

## Dashboard

Static page, no network: sortable/filterable board, detail drawer for every
protocol (model breakdown + farm plan), live-token view, and a peer-multiples
table. Screenshots in `screenshots/`: the board, a protocol detail view, and
a filtered (Dexs) view — all taken from this dashboard at 1440x900.

## Files

- `main.ts` — entrypoint (reads the snapshot, writes the board + dossier)
- `lib/model.ts` — the radar-2 model, farm plans, board gate
- `vendor/makefun-board.ts` — make.fun dossier builder (from the kit)
- `dashboard/` — the static page (index.html, app.css, app.js)
- `screenshots/` — the three screenshots of this dashboard
- `LICENSE` — MIT
