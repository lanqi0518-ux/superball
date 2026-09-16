import { NextResponse } from "next/server";
import { loadConfig, readPoolBalance, formatToken } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_POOL_TOKENS = 1_250_000;

export async function GET() {
  const cfg = loadConfig();
  if (!cfg.configured) {
    return NextResponse.json({
      configured: false,
      symbol: cfg.tokenSymbol,
      decimals: cfg.tokenDecimals,
      balanceRaw: null,
      balance: DEMO_POOL_TOKENS.toString(),
      usdValue: null,
      walletAddress: null,
      payoutBps: cfg.payoutBpsPerRound,
      demo: true,
    });
  }
  try {
    const raw = await readPoolBalance(cfg);
    const balance = formatToken(raw, cfg);
    const usdValue = cfg.usdPricePerToken
      ? Number(balance) * cfg.usdPricePerToken
      : null;
    return NextResponse.json({
      configured: true,
      symbol: cfg.tokenSymbol,
      decimals: cfg.tokenDecimals,
      balanceRaw: raw.toString(),
      balance,
      usdValue,
      walletAddress: cfg.walletAddress,
      chainId: cfg.chainId,
      tokenAddress: cfg.tokenAddress,
      payoutBps: cfg.payoutBpsPerRound,
      autoPayout: cfg.keyLoaded,
      demo: false,
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        error: err instanceof Error ? err.message : "rpc error",
        walletAddress: cfg.walletAddress,
        chainId: cfg.chainId,
      },
      { status: 502 },
    );
  }
}
