import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";

// ---- Config from env ------------------------------------------------------

export type ChainConfig = {
  chainId: number;
  rpcUrl: string;
  tokenAddress: Address;
  walletAddress: Address;
  privateKey?: Hex;
  tokenSymbol: string;
  tokenDecimals: number;
  payoutBpsPerRound: number; // basis points of pool paid per round (e.g. 100 = 1%)
  usdPricePerToken?: number;
  configured: boolean;
  keyLoaded: boolean;
};

export function loadConfig(): ChainConfig {
  const chainId = Number(process.env.POOL_CHAIN_ID ?? "0");
  const rpcUrl = process.env.POOL_RPC_URL ?? "";
  const tokenAddress = (process.env.POOL_TOKEN_ADDRESS ?? "") as Address;
  const walletAddress = (process.env.POOL_WALLET_ADDRESS ?? "") as Address;
  const privateKey = process.env.POOL_WALLET_PRIVATE_KEY as Hex | undefined;
  const tokenSymbol = process.env.POOL_TOKEN_SYMBOL ?? "TOKEN";
  const tokenDecimals = Number(process.env.POOL_TOKEN_DECIMALS ?? "18");
  const payoutBpsPerRound = Number(process.env.POOL_PAYOUT_BPS ?? "100"); // default 1%
  const usdPricePerToken = process.env.POOL_USD_PRICE
    ? Number(process.env.POOL_USD_PRICE)
    : undefined;

  const configured = Boolean(
    chainId && rpcUrl && tokenAddress && walletAddress,
  );

  return {
    chainId,
    rpcUrl,
    tokenAddress,
    walletAddress,
    privateKey,
    tokenSymbol,
    tokenDecimals,
    payoutBpsPerRound,
    usdPricePerToken,
    configured,
    keyLoaded: Boolean(privateKey),
  };
}

function pickChain(chainId: number) {
  const found = Object.values(chains).find(
    (c): c is (typeof chains)[keyof typeof chains] =>
      typeof c === "object" && c !== null && "id" in c && c.id === chainId,
  );
  if (found) return found;
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  } as const;
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
  return (await client.readContract({
    address: cfg.tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [cfg.walletAddress],
  })) as bigint;
}

export type Payout = { to: Address; amount: bigint; txHash?: Hex };

export async function payWinners(
  cfg: ChainConfig,
  payouts: Payout[],
): Promise<Payout[]> {
  const client = walletClient(cfg);
  const pub = publicClient(cfg);
  const out: Payout[] = [];
  for (const p of payouts) {
    if (p.amount <= 0n) {
      out.push(p);
      continue;
    }
    const hash = await client.writeContract({
      address: cfg.tokenAddress,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [p.to, p.amount],
    });
    await pub.waitForTransactionReceipt({ hash });
    out.push({ ...p, txHash: hash });
  }
  return out;
}

export function formatToken(amount: bigint, cfg: ChainConfig): string {
  return formatUnits(amount, cfg.tokenDecimals);
}
