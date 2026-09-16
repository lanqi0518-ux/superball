import { NextResponse } from "next/server";
import {
  formatSupply,
  getSnapshotCached,
  holdersToText,
  loadSnapshotConfig,
} from "@/lib/tokenHolders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snap = loadSnapshotConfig();
  if (!snap) {
    return NextResponse.json({
      configured: false,
      source: "manual",
    });
  }
  try {
    const data = await getSnapshotCached(snap);
    return NextResponse.json({
      configured: true,
      source: data.source,
      tokenAddress: snap.tokenAddress,
      totalSupply: data.totalSupply.toString(),
      totalSupplyFormatted: formatSupply(data.totalSupply, data.decimals),
      symbol: data.symbol,
      decimals: data.decimals,
      limit: snap.limit,
      excluded: [...snap.excluded],
      fetchedAt: data.fetchedAt,
      holders: data.holders,
      holdersText: holdersToText(data.holders),
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        error: err instanceof Error ? err.message : "snapshot error",
        tokenAddress: snap.tokenAddress,
      },
      { status: 502 },
    );
  }
}
