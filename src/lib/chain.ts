import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  parseAbi,
  parseEther,
  formatEther,
  formatUnits,
  defineChain,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";

// ---- Robinhood Chain (viem doesn't ship this yet) ------------------------
const robinhoodMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

const CUSTOM_CHAINS = [robinhoodMainnet];

// ---- Config from env ------------------------------------------------------

export type ChainConfig = {
  chainId: number;
  rpcUrl: string;
  native: boolean;
  tokenAddress?: Address;
  walletAddress: Address;
  privateKey?: Hex;
  tokenSymbol: string;
  tokenDecimals: number;
  payoutBps: number; // basis points of distributable pool paid per round
  gasReserveWei: bigint;
  usdPricePerToken?: number;
  configured: boolean;
  keyLoaded: boolean;
  explorerUrl?: string;
};

export function loadConfig(): ChainConfig {
  const chainId = Number(process.env.POOL_CHAIN_ID ?? "0");
  const rpcUrl = process.env.POOL_RPC_URL ?? "";
  const native = (process.env.POOL_NATIVE ?? "false").toLowerCase() === "true";
  const tokenAddress = (process.env.POOL_TOKEN_ADDRESS || undefined) as
    | Address
    | undefined;
  const walletAddress = (process.env.POOL_WALLET_ADDRESS ?? "") as Address;
  const privateKey = process.env.POOL_WALLET_PRIVATE_KEY as Hex | undefined;
  const tokenSymbol = process.env.POOL_TOKEN_SYMBOL ?? (native ? "ETH" : "TOKEN");
  const tokenDecimals = Number(process.env.POOL_TOKEN_DECIMALS ?? "18");
  const payoutBps = Number(process.env.POOL_PAYOUT_BPS ?? "10000"); // default 100%
  const gasReserveEth = process.env.POOL_GAS_RESERVE ?? "0";
  const gasReserveWei = parseEther(gasReserveEth as `${number}`);
  const usdPricePerToken = process.env.POOL_USD_PRICE
    ? Number(process.env.POOL_USD_PRICE)
    : undefined;
  const explorerUrl = process.env.POOL_EXPLORER_URL;

  const configured = Boolean(
    chainId && rpcUrl && walletAddress && (native || tokenAddress),
  );

  return {
    chainId,
    rpcUrl,
    native,
    tokenAddress,
    walletAddress,
    privateKey,
    tokenSymbol,
    tokenDecimals,
    payoutBps,
    gasReserveWei,
    usdPricePerToken,
    configured,
    keyLoaded: Boolean(privateKey),
    explorerUrl,
  };
}

function pickChain(chainId: number) {
  const custom = CUSTOM_CHAINS.find((c) => c.id === chainId);
  if (custom) return custom;
  const found = Object.values(chains).find(
    (c): c is (typeof chains)[keyof typeof chains] =>
      typeof c === "object" && c !== null && "id" in c && c.id === chainId,
  );
  if (found) return found;
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
}

// ---- ERC-20 helpers -------------------------------------------------------

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

function transportFor(cfg: ChainConfig) {
  const urls = [cfg.rpcUrl];
  const backup = process.env.POOL_RPC_URL_BACKUP;
  if (backup && backup !== cfg.rpcUrl) urls.push(backup);
  return fallback(
    urls.map((url) =>
      http(url, {
        retryCount: 4,
        retryDelay: 300,
        timeout: 15_000,
        batch: { wait: 20 },
      }),
    ),
    { rank: false },
  );
}

export function publicClient(cfg: ChainConfig) {
  return createPublicClient({
    chain: pickChain(cfg.chainId),
    transport: transportFor(cfg),
  });
}

export function walletClient(cfg: ChainConfig) {
  if (!cfg.privateKey) throw new Error("POOL_WALLET_PRIVATE_KEY not set");
  const account = privateKeyToAccount(cfg.privateKey);
  return createWalletClient({
    account,
    chain: pickChain(cfg.chainId),
    transport: transportFor(cfg),
  });
}

// Cache balance reads for 8s to protect the public RPC from rate limits.
// Freshness is fine — pool changes at most every few seconds.
let balanceCache: { key: string; at: number; value: bigint } | null = null;
const BALANCE_TTL_MS = 8_000;

export async function readPoolBalance(cfg: ChainConfig): Promise<bigint> {
  const key = `${cfg.chainId}:${cfg.walletAddress}:${cfg.native ? "native" : cfg.tokenAddress}`;
  const now = Date.now();
  if (balanceCache && balanceCache.key === key && now - balanceCache.at < BALANCE_TTL_MS) {
    return balanceCache.value;
  }
  const client = publicClient(cfg);
  const value = cfg.native
    ? await client.getBalance({ address: cfg.walletAddress })
    : ((await client.readContract({
        address: cfg.tokenAddress!,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [cfg.walletAddress],
      })) as bigint);
  balanceCache = { key, at: now, value };
  return value;
}

// Direct RPC read that bypasses the cache — used by /api/settle so payouts
// are computed against the freshest balance.
export async function readPoolBalanceFresh(cfg: ChainConfig): Promise<bigint> {
  const client = publicClient(cfg);
  const value = cfg.native
    ? await client.getBalance({ address: cfg.walletAddress })
    : ((await client.readContract({
        address: cfg.tokenAddress!,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [cfg.walletAddress],
      })) as bigint);
  const key = `${cfg.chainId}:${cfg.walletAddress}:${cfg.native ? "native" : cfg.tokenAddress}`;
  balanceCache = { key, at: Date.now(), value };
  return value;
}

export function distributable(balance: bigint, cfg: ChainConfig): bigint {
  if (!cfg.native) return balance;
  return balance > cfg.gasReserveWei ? balance - cfg.gasReserveWei : 0n;
}

export type Payout = {
  to: Address;
  amount: bigint;
  txHash?: Hex;
  error?: string;
};

// Sequential broadcast (viem auto-manages nonce so failed txs don't consume
// one) + parallel receipt wait. One bad recipient (e.g. contract without
// receive()) can't abort the round: it's recorded with an error and the
// next winner still gets paid.
export async function payWinners(
  cfg: ChainConfig,
  payouts: Payout[],
): Promise<Payout[]> {
  const nonZero = payouts.filter((p) => p.amount > 0n);
  const zero = payouts.filter((p) => p.amount <= 0n);
  if (nonZero.length === 0) return payouts;

  const wc = walletClient(cfg);
  const pub = publicClient(cfg);
  const account = wc.account;

  // Local nonce counter — Robinhood Chain's `pending` nonce lags after
  // recent broadcasts, so we cannot rely on viem's auto-fetch between
  // sequential sends. We increment locally on each successful broadcast
  // and re-sync from RPC on any nonce-related error.
  const refreshNonce = () =>
    pub.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });
  let nonce = await refreshNonce();

  const failed: Payout[] = [];
  const submitted: { p: Payout; hash: Hex }[] = [];

  for (const p of nonZero) {
    let attempt = 0;
    // Up to 2 tries per payout: once with local nonce, once after refresh.
    while (attempt < 2) {
      attempt++;
      try {
        let hash: Hex;
        if (cfg.native) {
          hash = await wc.sendTransaction({
            to: p.to,
            value: p.amount,
            nonce,
          });
        } else {
          hash = await wc.writeContract({
            address: cfg.tokenAddress!,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [p.to, p.amount],
            nonce,
          });
        }
        submitted.push({ p, hash });
        nonce++;
        break;
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message.split("\n")[0].slice(0, 200)
            : "send failed";
        // If the failure is nonce-related, refresh from RPC and retry once.
        if (/nonce/i.test(msg) && attempt < 2) {
          try {
            nonce = await refreshNonce();
          } catch {}
          continue;
        }
        failed.push({ ...p, error: msg });
        break;
      }
    }
  }

  const receipts = await Promise.all(
    submitted.map(async ({ p, hash }) => {
      try {
        await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
      } catch {
        // Broadcast succeeded but receipt confirmation timed out —
        // still count as sent, the tx hash is the source of truth.
      }
      return { ...p, txHash: hash };
    }),
  );

  return [...receipts, ...failed, ...zero];
}

export function formatAmount(amount: bigint, cfg: ChainConfig): string {
  if (cfg.native) return formatEther(amount);
  return formatUnits(amount, cfg.tokenDecimals);
}

export function explorerTx(cfg: ChainConfig, hash: string): string {
  const base =
    cfg.explorerUrl ??
    (cfg.chainId === 4663 ? "https://robinhoodchain.blockscout.com" : "");
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddress(cfg: ChainConfig, addr: string): string {
  const base =
    cfg.explorerUrl ??
    (cfg.chainId === 4663 ? "https://robinhoodchain.blockscout.com" : "");
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/address/${addr}`;
}
