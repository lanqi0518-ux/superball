import { NextResponse } from "next/server";
import {
  currentDrawRound,
  deriveDraw,
  fetchBeacon,
  ROUNDS_PER_DRAW,
} from "@/lib/drand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roundParam = url.searchParams.get("round");
  const now = Math.floor(Date.now() / 1000);
  const currentRound = currentDrawRound(now);
  let round = roundParam ? Number(roundParam) : currentRound;

  if (!Number.isInteger(round) || round < 1) {
    return NextResponse.json({ error: "Invalid round" }, { status: 400 });
  }
  if ((round - 1) % ROUNDS_PER_DRAW !== 0) {
    return NextResponse.json(
      {
        error:
          "Round is not aligned to the 3-minute draw cadence. Use a round from /api/beacon.",
      },
      { status: 400 },
    );
  }
  if (round > currentRound) {
    return NextResponse.json(
      { error: "Draw round has not been produced yet", currentRound },
      { status: 425 },
    );
  }

  try {
    const beacon = await fetchBeacon(round);
    const draw = await deriveDraw(beacon);
    const offset = Number(process.env.POOL_ROUND_OFFSET ?? "0");
    return NextResponse.json(
      { ...draw, displayedRound: Math.max(0, draw.round - offset) },
      { headers: { "Cache-Control": "public, max-age=15" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
