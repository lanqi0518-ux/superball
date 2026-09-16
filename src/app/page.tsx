import HomeClient from "./HomeClient";
import { fetchBeacon } from "@/lib/drand";
import type { DrawResult } from "@/lib/drand";
import { currentDrawRound, deriveDraw } from "@/lib/drand";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadInitialDraw(): Promise<DrawResult | null> {
  try {
    const round = currentDrawRound(Math.floor(Date.now() / 1000));
    const beacon = await fetchBeacon(round);
    const draw = await deriveDraw(beacon);
    const offset = Number(process.env.POOL_ROUND_OFFSET ?? "0");
    return { ...draw, displayedRound: Math.max(0, draw.round - offset) };
  } catch {
    return null;
  }
}

export default async function Page() {
  const initialDraw = await loadInitialDraw();
  return <HomeClient initialDraw={initialDraw} />;
}
