// lib/model.ts — value model and board builder for the token radar.
//
// Everything here is derived from the sealed snapshot. Peer multiples come
// from the market-cap-to-TVL ratios of protocols that already record a token,
// and every other input (TVL, 7-day change, listing date, chain count) is a
// field of the protocol being valued. No value is keyed to a protocol name.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface Multipliers {
  peer: number;
  growth: number;
  maturity: number;
  size: number;
  chains: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  watchlist: boolean;
  rank: number;
  implied_value_usd: number;
  multipliers: Multipliers;
  farm_steps: string[];
}

export interface LiveTokenRow {
  slug: string;
  name: string;
  category: string;
  symbol: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface PeerRow {
  category: string;
  live_peers: number;
  median_ratio: number | null;
  peer_multiple: number;
}

export interface Board {
  as_of: string;
  floor_usd: number;
  protocol_count: number;
  watchlist_count: number;
  row_count: number;
  live_token_count: number;
  global_median: number;
  peer_multiples: PeerRow[];
  live_tokens: LiveTokenRow[];
  rows: BoardRow[];
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// A protocol "records a token" when the snapshot carries a CoinGecko id or a
// ticker for it. That is a statement about the record, not a claim that the
// protocol has no token: a token the record does not carry is still possible.
export function hasLiveToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

export function categoryOf(p: SnapshotProtocol): string {
  return p.category === null || p.category === "" ? "Uncategorised" : p.category;
}

// --- Peer multiples -------------------------------------------------------
// For each category, the peer multiple is the median market-cap-to-TVL ratio
// of that category's live-token protocols, each ratio clipped to [0.02, 2.0].
// The median is then shrunk toward the global median with 5
// pseudo-observations and capped to [0.05, 1.0]. A category with fewer than
// three live peers has no median worth shrinking, so it takes the global
// median outright. The global median itself is the median of the live-token
// ratios that fall inside the credible band (0.02, 2.0): zero-cap tokens and
// ratios above twice TVL are not credible anchors for the whole market.

const RATIO_LOW = 0.02;
const RATIO_HIGH = 2.0;
const PSEUDO_OBS = 5;
const MIN_PEERS = 3;
const PEER_FLOOR = 0.05;
const PEER_CEIL = 1.0;

export interface PeerTable {
  globalMedian: number;
  byCategory: Map<string, number>;
  rows: PeerRow[];
}

export function computePeerMultiples(protocols: SnapshotProtocol[]): PeerTable {
  const live = protocols.filter(
    (p) => hasLiveToken(p) && p.mcap_usd !== null && p.tvl_usd > 0,
  );
  const ratios = live.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const inBand = ratios.filter((r) => r > RATIO_LOW && r < RATIO_HIGH);
  const globalMedian = round4(
    inBand.length > 0
      ? median(inBand)
      : median(ratios.map((r) => clamp(r, RATIO_LOW, RATIO_HIGH))),
  );
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = categoryOf(p);
    const ratio = clamp((p.mcap_usd as number) / p.tvl_usd, RATIO_LOW, RATIO_HIGH);
    const list = byCategory.get(key);
    if (list) list.push(ratio);
    else byCategory.set(key, [ratio]);
  }
  const multiples = new Map<string, number>();
  const rows: PeerRow[] = [];
  for (const category of [...byCategory.keys()].sort()) {
    const list = byCategory.get(category) as number[];
    const med = median(list);
    const peer =
      list.length < MIN_PEERS
        ? globalMedian
        : round4(
            clamp(
              (list.length * med + PSEUDO_OBS * globalMedian) /
                (list.length + PSEUDO_OBS),
              PEER_FLOOR,
              PEER_CEIL,
            ),
          );
    multiples.set(category, peer);
    rows.push({ category, live_peers: list.length, median_ratio: round4(med), peer_multiple: peer });
  }
  rows.sort(
    (a, b) =>
      b.peer_multiple - a.peer_multiple || (a.category < b.category ? -1 : 1),
  );
  return { globalMedian, byCategory: multiples, rows };
}

// --- Multipliers ----------------------------------------------------------
// Every multiplier is rounded to 4 decimals before the implied value is
// computed, so the dashboard can recompute a row's value exactly from the
// multipliers the row carries.

const MATURITY_CAP_DAYS = 1460;

export function ageDays(listedAt: string | null, asOf: string): number {
  if (listedAt === null) return 0;
  const start = Date.parse(listedAt + "T00:00:00Z");
  const end = Date.parse(asOf + "T00:00:00Z");
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function multipliersFor(
  p: SnapshotProtocol,
  peer: number,
  asOf: string,
): Multipliers {
  const change = p.change_7d === null ? 0 : clamp(p.change_7d, -50, 80);
  const growth = round4(1 + (change / 100) * 0.4);
  const age = ageDays(p.listed_at, asOf);
  const maturity = round4(0.7 + (Math.min(age, MATURITY_CAP_DAYS) / MATURITY_CAP_DAYS) * 0.3);
  const size = round4(clamp(Math.pow(p.tvl_usd / 1e9, -0.07), 0.75, 1.2));
  const chains = round4(1 + 0.02 * Math.min(p.chains.length, 5));
  return { peer: round4(peer), growth, maturity, size, chains };
}

export function impliedValue(tvlUsd: number, m: Multipliers): number {
  return Math.round(tvlUsd * m.peer * m.growth * m.maturity * m.size * m.chains);
}

// --- Farm plans -----------------------------------------------------------
// Each row carries seven concrete steps, each stating what it costs and how
// long it takes. The opening move depends on what the protocol does, so the
// plan reads differently for a lender, a dex, a vault curator, or a bridge;
// the shape (fresh wallet, first position, points, weekly habit, hold, safe
// claim, log) is the same for every protocol.

interface CategoryAction {
  open: string;
  weekly: string;
}

const ACTIONS: Record<string, CategoryAction> = {
  Lending: {
    open: "supply stablecoins to the lending market and start earning interest",
    weekly: "top up the supply or move it to the market paying the best rate",
  },
  Dexs: {
    open: "swap a small amount and add liquidity to the busiest pool",
    weekly: "rebalance the pool position and collect the trading fees",
  },
  Yield: {
    open: "deposit into the highest-TVL yield vault",
    weekly: "harvest the vault yield and redeposit it",
  },
  "Yield Aggregator": {
    open: "deposit into the highest-TVL yield vault",
    weekly: "harvest the vault yield and redeposit it",
  },
  RWA: {
    open: "deposit into a tokenised real-world-asset vault",
    weekly: "check the vault yield accrual and add a little more",
  },
  Derivatives: {
    open: "open a small hedged perpetuals position",
    weekly: "roll the position and bank any funding-rate gains",
  },
  CDP: {
    open: "open a small collateralised-debt position and mint the stablecoin",
    weekly: "check the collateral ratio and top it up if it slips",
  },
  "Liquid Staking": {
    open: "stake a small amount and hold the liquid staking receipt",
    weekly: "restake the staking rewards",
  },
  "Liquid Restaking": {
    open: "stake a small amount and hold the liquid restaking receipt",
    weekly: "restake the restaking rewards",
  },
  Restaking: {
    open: "restake a small amount through the protocol",
    weekly: "restake the restaking rewards",
  },
  "Staking Pool": {
    open: "stake a small amount in the staking pool",
    weekly: "restake the staking rewards",
  },
  "Risk Curators": {
    open: "deposit into the curator vault with the longest track record",
    weekly: "read the curator allocation report and rebalance if it changed",
  },
  "Onchain Capital Allocator": {
    open: "deposit into the allocator vault with the longest track record",
    weekly: "read the allocator report and rebalance if it changed",
  },
  "Basis Trading": {
    open: "deposit into the basis-trading vault",
    weekly: "check the funding-rate capture and add a little more",
  },
  "Cross Chain Bridge": {
    open: "bridge a small test amount to the destination chain and back",
    weekly: "bridge a small amount on a new route to stay active",
  },
  Launchpad: {
    open: "join the launchpad and stake the entry amount for the next sale",
    weekly: "check the upcoming sale calendar and vote where it counts",
  },
  "Prediction Market": {
    open: "place a small prediction-market position on a market you follow",
    weekly: "settle finished positions and open one fresh small position",
  },
  Farm: {
    open: "deposit into the farm and start earning rewards",
    weekly: "harvest the farm rewards and redeposit them",
  },
  "Liquidity Manager": {
    open: "deposit into the managed liquidity vault",
    weekly: "review the vault range and rebalance if it drifted",
  },
  "Collateral Management": {
    open: "deposit collateral and open a small managed position",
    weekly: "check the collateral health and top it up if it slips",
  },
  CEX: {
    open: "open an account, finish the checks, and place a small spot trade",
    weekly: "place one small spot trade and keep the account active",
  },
  Chain: {
    open: "bridge in a small amount and use the chain flagship app",
    weekly: "use one flagship app on the chain and pay its gas",
  },
  Payments: {
    open: "make a small payment through the protocol",
    weekly: "make one small payment through the protocol",
  },
};

const DEFAULT_ACTION: CategoryAction = {
  open: "use the protocol main product with a small position",
  weekly: "repeat the core action and keep the position active",
};

function actionFor(category: string): CategoryAction {
  return ACTIONS[category] ?? DEFAULT_ACTION;
}

interface GasInfo {
  token: string;
  cost: string;
}

const GAS: Record<string, GasInfo> = {
  Ethereum: { token: "ETH", cost: "$3" },
  Base: { token: "ETH", cost: "$0.10" },
  Arbitrum: { token: "ETH", cost: "$0.15" },
  Optimism: { token: "ETH", cost: "$0.10" },
  Unichain: { token: "ETH", cost: "$0.10" },
  Solana: { token: "SOL", cost: "$0.01" },
  Binance: { token: "BNB", cost: "$0.20" },
  Polygon: { token: "POL", cost: "$0.05" },
  Avalanche: { token: "AVAX", cost: "$0.30" },
  Fantom: { token: "FTM", cost: "$0.10" },
  Linea: { token: "ETH", cost: "$0.15" },
  Scroll: { token: "ETH", cost: "$0.15" },
  zkSync: { token: "ETH", cost: "$0.15" },
  Berachain: { token: "BERA", cost: "$0.10" },
  Hyperliquid: { token: "HYPE", cost: "$0.05" },
};

function gasFor(chain: string): GasInfo {
  return GAS[chain] ?? { token: "ETH", cost: "$0.50" };
}

export function farmPlan(p: SnapshotProtocol): string[] {
  const action = actionFor(categoryOf(p));
  const chain = p.chains.length > 0 ? p.chains[0] : "Ethereum";
  const gas = gasFor(chain);
  const name = p.name;
  return [
    `Open a fresh wallet just for ${name}, fund it with about $10 of ${gas.token} for gas on ${chain}, and store its seed phrase offline on paper; cost about $10 plus network fees, time about 10 minutes.`,
    `On ${chain}, ${action.open} with $100 to $250; expect gas of about ${gas.cost} and about 15 minutes, and save the transaction hash.`,
    `Join the ${name} points programme: connect the fresh wallet in the protocol's own app, finish the onboarding quests, and check the points balance appears; free except gas of about ${gas.cost}, time about 10 minutes.`,
    `Each week, ${action.weekly}; budget about ${gas.cost} of gas per week and about 10 minutes, so the position stays active for snapshots.`,
    `Leave the position untouched for at least 30 days so it survives the usual snapshot window; no extra cost, only patience, and never move the funds to another wallet.`,
    `If ${name} launches a token, claim only inside the protocol's own app, verify the claim contract address first, and never approve an unlimited spend; claim gas is about ${gas.cost} and the check takes about 10 minutes.`,
    `Keep a farm log with the date, amount, transaction hash, and points balance of every step, and review it once a week for about 5 minutes; the log costs nothing and is the proof of the farm later.`,
  ];
}

// --- Board ----------------------------------------------------------------
// Rank every pre-token protocol the radar covers: the whole watchlist, plus
// every rankable pre-token protocol below the floor. Below the floor, bridged
// products (Bridge and Canonical Bridge) are left out: a bridge moves a
// token that already exists, it is not a launch of its own. Protocols above
// the floor that the watchlist leaves out are left out for the same reason
// the watchlist leaves them out: they are wrapped, staked, bridged, or
// versioned products of something that already trades. Protocols that
// record a token are never ranked; the 24 largest of them by market cap are
// set aside in the live-token view instead.

const BRIDGE_CATEGORIES = new Set(["Bridge", "Canonical Bridge"]);
const LIVE_TOKEN_VIEW = 24;

export function buildBoard(snapshot: Snapshot): Board {
  const peerTable = computePeerMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const floor = snapshot.floor_usd;
  const rankable = snapshot.protocols.filter((p) => {
    if (hasLiveToken(p)) return false;
    if (watchlist.has(p.slug)) return true;
    if (p.tvl_usd >= floor) return false;
    return !BRIDGE_CATEGORIES.has(categoryOf(p));
  });
  const rows: BoardRow[] = rankable.map((p) => {
    const peer = peerTable.byCategory.get(categoryOf(p)) ?? peerTable.globalMedian;
    const m = multipliersFor(p, peer, snapshot.as_of);
    return {
      slug: p.slug,
      name: p.name,
      category: categoryOf(p),
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(p.listed_at, snapshot.as_of),
      watchlist: watchlist.has(p.slug),
      rank: 0,
      implied_value_usd: impliedValue(p.tvl_usd, m),
      multipliers: m,
      farm_steps: farmPlan(p),
    };
  });
  rows.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  );
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  const liveTokens: LiveTokenRow[] = snapshot.protocols
    .filter((p) => hasLiveToken(p) && p.mcap_usd !== null && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: categoryOf(p),
      symbol: p.symbol,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      ratio: round4((p.mcap_usd as number) / p.tvl_usd),
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_TOKEN_VIEW);
  const peerRows = new Map<string, PeerRow>(
    peerTable.rows.map((r) => [r.category, r]),
  );
  for (const row of rows) {
    if (!peerRows.has(row.category)) {
      peerRows.set(row.category, {
        category: row.category,
        live_peers: 0,
        median_ratio: null,
        peer_multiple: peerTable.globalMedian,
      });
    }
  }
  const peerMultiples = [...peerRows.values()].sort(
    (a, b) =>
      b.peer_multiple - a.peer_multiple || (a.category < b.category ? -1 : 1),
  );
  return {
    as_of: snapshot.as_of,
    floor_usd: floor,
    protocol_count: snapshot.protocols.length,
    watchlist_count: snapshot.watchlist.length,
    row_count: rows.length,
    live_token_count: snapshot.protocols.filter(hasLiveToken).length,
    global_median: peerTable.globalMedian,
    peer_multiples: peerMultiples,
    live_tokens: liveTokens,
    rows,
  };
}
