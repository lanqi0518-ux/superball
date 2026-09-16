import { NextResponse } from "next/server";
import {
  distributable,
  explorerAddress,
  formatAmount,
  loadConfig,
  readPoolBalance,
} from "@/lib/chain";
import { usdPriceFor } from "@/lib/price";

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
    const [raw, price] = await Promise.all([
      readPoolBalance(cfg),
      usdPriceFor(cfg.tokenSymbol),
    ]);
    const dist = distributable(raw, cfg);
    const balance = formatAmount(raw, cfg);
    const distributableStr = formatAmount(dist, cfg);
    const reserve = formatAmount(cfg.gasReserveWei, cfg);
    const usdValue = price != null ? Number(balance) * price : null;
    const distributableUsd =
      price != null ? Number(distributableStr) * price : null;
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
      usdPrice: price,
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
