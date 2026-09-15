import { NextResponse } from "next/server";
import {
  currentDrawRound,
  DRAND_CHAIN_HASH,
  DRAND_GENESIS,
  DRAND_PERIOD_SECONDS,
  DRAW_INTERVAL_SECONDS,
  nextDrawRound,
  roundAt,
  timeOfRound,
} from "@/lib/drand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = Math.floor(Date.now() / 1000);
  const currentBeaconRound = roundAt(now);
  const currentRound = currentDrawRound(now);
  const nextRound = nextDrawRound(now);
  return NextResponse.json({
    now,
    beaconRound: currentBeaconRound,
    currentRound,
    nextRound,
    currentDrawAt: timeOfRound(currentRound),
    nextDrawAt: timeOfRound(nextRound),
    drawIntervalSeconds: DRAW_INTERVAL_SECONDS,
    beaconPeriod: DRAND_PERIOD_SECONDS,
    genesis: DRAND_GENESIS,
    chainHash: DRAND_CHAIN_HASH,
  });
}
