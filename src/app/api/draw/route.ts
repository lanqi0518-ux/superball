import { NextResponse } from "next/server";
import { deriveDraw, fetchBeacon, roundAt } from "@/lib/drand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roundParam = url.searchParams.get("round");
  const round = roundParam ? Number(roundParam) : undefined;

  if (round !== undefined) {
    if (!Number.isInteger(round) || round < 1) {
      return NextResponse.json({ error: "Invalid round" }, { status: 400 });
    }
    const nowRound = roundAt(Math.floor(Date.now() / 1000));
    if (round > nowRound) {
      return NextResponse.json(
        { error: "Round has not been produced yet", currentRound: nowRound },
        { status: 425 },
      );
    }
  }

  try {
    const beacon = await fetchBeacon(round);
    const draw = await deriveDraw(beacon);
    return NextResponse.json(draw, {
      headers: { "Cache-Control": "public, max-age=15" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
