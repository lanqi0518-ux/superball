import type { Address } from "viem";
import { formatUnits, getAddress, parseAbi } from "viem";
import { publicClient, loadConfig, type ChainConfig } from "./chain";
import type { Holder } from "./holders";

export type SnapshotSource = "blockscout" | "onchain" | "manual";

export type SnapshotConfig = {
  tokenAddress: Address;
  explorerBase: string;
  limit: number;
  excluded: Set<string>;
  chainCfg: ChainConfig;
};

const ERC20_ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export function loadSnapshotConfig(): SnapshotConfig | null {
  const cfg = loadConfig();
  const tokenAddress = process.env.POOL_HOLDER_TOKEN_ADDRESS as
    | Address
    | undefined;
  if (!tokenAddress || !cfg.chainId || !cfg.rpcUrl) return null;
  const explorerBase =
    process.env.POOL_EXPLORER_URL ??
    (cfg.chainId === 4663 ? "https://robinhoodchain.blockscout.com" : "");
  if (!explorerBase) return null;
  const limit = Math.min(
    Math.max(1, Number(process.env.POOL_HOLDER_LIMIT ?? "100")),
    500,
  );
  const excluded = new Set(
    (process.env.POOL_EXCLUDE_ADDRESSES ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((a) => a.toLowerCase()),
  );
  // Always exclude the pool wallet itself and common burn addresses.
  excluded.add(cfg.walletAddress.toLowerCase());
  excluded.add("0x0000000000000000000000000000000000000000");
  excluded.add("0x000000000000000000000000000000000000dead");
  return {
    tokenAddress: getAddress(tokenAddress),
    explorerBase: explorerBase.replace(/\/$/, ""),
    limit,
    excluded,
    chainCfg: cfg,
  };
}

type BlockscoutHoldersResponse = {
  items: {
    address: { hash: string };
    value: string;
  }[];
};

export async function fetchSnapshotHolders(
  snap: SnapshotConfig,
): Promise<{ holders: Holder[]; totalSupply: bigint; decimals: number; symbol: string; source: SnapshotSource; excluded: string[]; fetchedAt: number }> {
  const client = publicClient(snap.chainCfg);
  const [totalSupply, decimals, symbol] = await Promise.all([
    client.readContract({
      address: snap.tokenAddress,
      abi: ERC20_ABI,
      functionName: "totalSupply",
    }) as Promise<bigint>,
    client.readContract({
      address: snap.tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    }) as Promise<number>,
    client.readContract({
      address: snap.tokenAddress,
      abi: ERC20_ABI,
      functionName: "symbol",
    }) as Promise<string>,
  ]);

  // Blockscout v2 tokens/{addr}/holders returns 50 per page and paginates
  // via next_page_params. We fetch pages until we hit snap.limit holders.
  const headers = {
    accept: "application/json",
    "user-agent":
      "Mozilla/5.0 (compatible; SuperBallDraw/1.0; +https://superball-draw.fly.dev)",
  };
  const items: BlockscoutHoldersResponse["items"] = [];
  let cursor: string | null = null;
  const base = `${snap.explorerBase}/api/v2/tokens/${snap.tokenAddress}/holders`;
  for (let page = 0; page < 20; page++) {
    const u = cursor ? `${base}?${cursor}` : base;
    const res: Response = await fetch(u, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`blockscout holders fetch ${res.status}`);
    const data = (await res.json()) as BlockscoutHoldersResponse & {
      next_page_params?: Record<string, string | number> | null;
    };
    for (const it of data.items ?? []) items.push(it);
    if (items.length >= snap.limit) break;
    const npp = data.next_page_params;
    if (!npp) break;
    cursor = new URLSearchParams(
      Object.fromEntries(
        Object.entries(npp).map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
  }

  const excluded: string[] = [];
  const holders: Holder[] = [];
  for (const it of items.slice(0, snap.limit)) {
    const addr = it.address?.hash?.toLowerCase();
    if (!addr) continue;
    if (snap.excluded.has(addr)) {
      excluded.push(addr);
      continue;
    }
    const balance = BigInt(it.value ?? "0");
    if (balance <= 0n || totalSupply <= 0n) continue;
    // percent with 4 decimal digits of precision, then to a plain number
    const pctBps = (balance * 1_000_000n) / totalSupply; // ppm
    const percent = Number(pctBps) / 10_000; // = balance/totalSupply * 100
    if (percent < 0.1) continue; // < 0.1% earns zero slots anyway
    holders.push({ address: getAddress(addr), percent });
  }

  holders.sort((a, b) => b.percent - a.percent);

  return {
    holders,
    totalSupply,
    decimals,
    symbol,
    source: "blockscout",
    excluded,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

export function holdersToText(holders: Holder[]): string {
  return holders
    .map((h) => `${h.address}, ${h.percent.toFixed(4)}`)
    .join("\n");
}

// Simple in-process cache to avoid hammering Blockscout.
let cache: {
  key: string;
  at: number;
  data: Awaited<ReturnType<typeof fetchSnapshotHolders>>;
} | null = null;
const CACHE_TTL_SECONDS = 25;

export async function getSnapshotCached(
  snap: SnapshotConfig,
): Promise<Awaited<ReturnType<typeof fetchSnapshotHolders>>> {
  const key = `${snap.tokenAddress}:${snap.limit}:${[...snap.excluded].sort().join(",")}`;
  const now = Math.floor(Date.now() / 1000);
  if (cache && cache.key === key && now - cache.at < CACHE_TTL_SECONDS) {
    return cache.data;
  }
  const data = await fetchSnapshotHolders(snap);
  cache = { key, at: now, data };
  return data;
}

export function formatSupply(
  total: bigint,
  decimals: number,
): string {
  const s = formatUnits(total, decimals);
  const n = Number(s);
  if (!isFinite(n)) return s;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toLocaleString();
}
