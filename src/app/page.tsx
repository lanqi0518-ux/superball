import HomeClient from "./HomeClient";
import { fetchBeacon } from "@/lib/drand";
import type { DrawResult } from "@/lib/drand";
import { deriveDraw } from "@/lib/drand";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadInitialDraw(): Promise<DrawResult | null> {
  try {
    const beacon = await fetchBeacon();
    return await deriveDraw(beacon);
  } catch {
    return null;
  }
}

export default async function Page() {
  const initialDraw = await loadInitialDraw();
  return <HomeClient initialDraw={initialDraw} />;
}
