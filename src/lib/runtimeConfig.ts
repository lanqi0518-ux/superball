import { promises as fs } from "node:fs";
import path from "node:path";

// Hot-swappable runtime overrides. Values here win over env vars, so we can
// change the holder token address (and other tunables) live without a
// deploy or a machine restart. Persisted on the Fly volume at /data so
// overrides survive restarts.

export type RuntimeConfig = {
  holderTokenAddress?: string;
  holderLimit?: number;
  excludeAddresses?: string[];
  usdPriceId?: string;
  updatedAt?: number;
};

const RUNTIME_PATH =
  process.env.RUNTIME_CONFIG_PATH ?? "/data/runtime-config.json";

let cache: { at: number; value: RuntimeConfig } | null = null;
const CACHE_TTL_MS = 3_000; // small cache to avoid re-reading on every request

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const raw = await fs.readFile(RUNTIME_PATH, "utf-8");
    const value = JSON.parse(raw) as RuntimeConfig;
    cache = { at: now, value };
    return value;
  } catch {
    cache = { at: now, value: {} };
    return {};
  }
}

export async function setRuntimeConfig(
  patch: Partial<RuntimeConfig>,
): Promise<RuntimeConfig> {
  const current = await getRuntimeConfig();
  const next: RuntimeConfig = {
    ...current,
    ...patch,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  // Normalise empty strings to undefined so callers can clear overrides.
  if (patch.holderTokenAddress === "") delete next.holderTokenAddress;
  if (patch.usdPriceId === "") delete next.usdPriceId;
  try {
    await fs.mkdir(path.dirname(RUNTIME_PATH), { recursive: true });
    await fs.writeFile(RUNTIME_PATH, JSON.stringify(next, null, 2), "utf-8");
  } catch (err) {
    throw new Error(
      `failed to write runtime config: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  cache = { at: Date.now(), value: next };
  return next;
}

// Convenience getters that fall back to env vars if runtime override is unset.
export async function effectiveHolderTokenAddress(): Promise<string | undefined> {
  const rc = await getRuntimeConfig();
  return rc.holderTokenAddress || process.env.POOL_HOLDER_TOKEN_ADDRESS || undefined;
}

export async function effectiveHolderLimit(): Promise<number> {
  const rc = await getRuntimeConfig();
  return rc.holderLimit ?? Number(process.env.POOL_HOLDER_LIMIT ?? "100");
}

export async function effectiveExcludes(): Promise<string[]> {
  const rc = await getRuntimeConfig();
  if (rc.excludeAddresses && rc.excludeAddresses.length > 0)
    return rc.excludeAddresses;
  return (process.env.POOL_EXCLUDE_ADDRESSES ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
}
