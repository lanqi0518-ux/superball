import {
  createPublicClient,
  createWalletClient,
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

export function publicClient(cfg: ChainConfig) {
  return createPublicClient({
    chain: pickChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
}

export function walletClient(cfg: ChainConfig) {
  if (!cfg.privateKey) throw new Error("POOL_WALLET_PRIVATE_KEY not set");
  const account = privateKeyToAccount(cfg.privateKey);
  return createWalletClient({
    account,
    chain: pickChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
}

export async function readPoolBalance(cfg: ChainConfig): Promise<bigint> {
  const client = publicClient(cfg);
  if (cfg.native) {
    return client.getBalance({ address: cfg.walletAddress });
  }
  return (await client.readContract({
    address: cfg.tokenAddress!,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [cfg.walletAddress],
  })) as bigint;
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

// Parallel payouts with explicit sequential nonces + per-tx try/catch.
// One bad recipient (e.g. contract without receive()) can't abort the round.
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
  const startNonce = await pub.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  const sends = nonZero.map((p, i) =>
    (async (): Promise<Payout> => {
      const nonce = startNonce + i;
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
        try {
          await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
        } catch {
          // Tx broadcast but receipt timed out — still succeeded to submit.
        }
        return { ...p, txHash: hash };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message.split("\n")[0].slice(0, 200)
            : "send failed";
        return { ...p, error: msg };
      }
    })(),
  );

  const results = await Promise.all(sends);
  return [...results, ...zero];
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
