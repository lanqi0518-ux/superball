import { NextResponse } from "next/server";
import {
  distributable,
  explorerAddress,
  formatAmount,
  loadConfig,
  readPoolBalance,
} from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = loadConfig();
  if (!cfg.configured) {
    return NextResponse.json({
      configured: false,
      symbol: cfg.tokenSymbol,
      decimals: cfg.tokenDecimals,
      native: cfg.native,
      walletAddress: cfg.walletAddress || null,
      payoutBps: cfg.payoutBps,
    });
  }
  try {
    const raw = await readPoolBalance(cfg);
    const dist = distributable(raw, cfg);
    const balance = formatAmount(raw, cfg);
    const distributableStr = formatAmount(dist, cfg);
    const reserve = formatAmount(cfg.gasReserveWei, cfg);
    const usdValue = cfg.usdPricePerToken
      ? Number(balance) * cfg.usdPricePerToken
      : null;
    const distributableUsd = cfg.usdPricePerToken
      ? Number(distributableStr) * cfg.usdPricePerToken
      : null;
    return NextResponse.json({
      configured: true,
      native: cfg.native,
      symbol: cfg.tokenSymbol,
      decimals: cfg.tokenDecimals,
      balance,
      balanceRaw: raw.toString(),
      distributable: distributableStr,
      distributableRaw: dist.toString(),
      reserve,
      reserveRaw: cfg.gasReserveWei.toString(),
      usdValue,
      distributableUsd,
      walletAddress: cfg.walletAddress,
      walletExplorer: explorerAddress(cfg, cfg.walletAddress),
      chainId: cfg.chainId,
      tokenAddress: cfg.tokenAddress ?? null,
      payoutBps: cfg.payoutBps,
      autoPayout: cfg.keyLoaded,
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
