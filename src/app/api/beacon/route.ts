import { NextResponse } from "next/server";
import {
  DRAND_CHAIN_HASH,
  DRAND_GENESIS,
  DRAND_PERIOD_SECONDS,
  roundAt,
  timeOfRound,
} from "@/lib/drand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = Math.floor(Date.now() / 1000);
  const current = roundAt(now);
  return NextResponse.json({
    now,
    currentRound: current,
    nextRound: current + 1,
    nextDrawAt: timeOfRound(current + 1),
    period: DRAND_PERIOD_SECONDS,
    genesis: DRAND_GENESIS,
    chainHash: DRAND_CHAIN_HASH,
  });
}
