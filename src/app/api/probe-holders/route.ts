import { NextResponse } from "next/server";
import { getAddress } from "viem";
import type { Address } from "viem";
import { loadConfig } from "@/lib/chain";
import { fetchSnapshotHolders } from "@/lib/tokenHolders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/probe-holders?token=0x...  (requires SETTLE_SECRET bearer)
// Tests Blockscout snapshot for an arbitrary token without changing env vars.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.SETTLE_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "?token= required" }, { status: 400 });
  }

  let tokenAddress: Address;
  try {
    tokenAddress = getAddress(token);
  } catch {
    return NextResponse.json({ error: "invalid token address" }, { status: 400 });
  }

  const chainCfg = loadConfig();
  if (!chainCfg.chainId || !chainCfg.rpcUrl) {
    return NextResponse.json({ error: "chain not configured" }, { status: 400 });
  }

  const explorerBase =
    process.env.POOL_EXPLORER_URL ??
    (chainCfg.chainId === 4663
      ? "https://robinhoodchain.blockscout.com"
      : "");
  if (!explorerBase) {
    return NextResponse.json({ error: "no explorer" }, { status: 400 });
  }

  const snap = {
    tokenAddress,
    explorerBase: explorerBase.replace(/\/$/, ""),
    limit: 20,
    excluded: new Set<string>([
      chainCfg.walletAddress.toLowerCase(),
      "0x0000000000000000000000000000000000000000",
      "0x000000000000000000000000000000000000dead",
    ]),
    chainCfg,
  };
  try {
    const data = await fetchSnapshotHolders(snap);
    return NextResponse.json({
      ok: true,
      symbol: data.symbol,
      decimals: data.decimals,
      totalSupply: data.totalSupply.toString(),
      holdersReturned: data.holders.length,
      holders: data.holders.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 502 },
    );
  }
}
