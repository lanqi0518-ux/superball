// Lightweight USD price fetcher. Uses CoinGecko's free simple/price API
// (no key needed, ~10-30 rpm on free tier). Result is cached in-process for
// 60 seconds. Set POOL_USD_PRICE env to override with a fixed price.

const SYMBOL_TO_ID: Record<string, string> = {
  ETH: "ethereum",
  WETH: "weth",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  MATIC: "matic-network",
  POL: "matic-network",
  BNB: "binancecoin",
  SOL: "solana",
  ARB: "arbitrum",
  OP: "optimism",
  BASE: "base",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
};

type CacheEntry = { price: number; at: number };
const cache = new Map<string, CacheEntry>();
const TTL_SECONDS = 60;

export async function usdPriceFor(symbol: string): Promise<number | null> {
  const override = process.env.POOL_USD_PRICE;
  if (override) {
    const n = Number(override);
    return Number.isFinite(n) ? n : null;
  }
  const idOverride = process.env.POOL_USD_PRICE_ID;
  const id = idOverride ?? SYMBOL_TO_ID[symbol.toUpperCase()];
  if (!id) return null;

  const now = Math.floor(Date.now() / 1000);
  const cached = cache.get(id);
  if (cached && now - cached.at < TTL_SECONDS) return cached.price;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      id,
    )}&vs_currencies=usd`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return cached?.price ?? null;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const price = data[id]?.usd;
    if (typeof price !== "number") return cached?.price ?? null;
    cache.set(id, { price, at: now });
    return price;
  } catch {
    return cached?.price ?? null;
  }
}
