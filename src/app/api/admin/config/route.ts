import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getRuntimeConfig, setRuntimeConfig } from "@/lib/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.SETTLE_SECRET ?? "";
  return Boolean(secret) && auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const cfg = await getRuntimeConfig();
  return NextResponse.json({ ok: true, config: cfg });
}

// POST accepts any subset of:
//   {
//     "holderTokenAddress": "0x...",   // or "" to clear
//     "holderLimit": 100,
//     "excludeAddresses": ["0x...", ...],
//     "usdPriceId": "coingecko-id"     // or "" to clear
//   }
// Hot-applies without restart.
export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Parameters<typeof setRuntimeConfig>[0] = {};

  if ("holderTokenAddress" in body) {
    const v = body.holderTokenAddress;
    if (typeof v !== "string") {
      return NextResponse.json(
        { error: "holderTokenAddress must be string" },
        { status: 400 },
      );
    }
    if (v === "") {
      patch.holderTokenAddress = "";
    } else {
      try {
        patch.holderTokenAddress = getAddress(v);
      } catch {
        return NextResponse.json(
          { error: `invalid EVM address: ${v}` },
          { status: 400 },
        );
      }
    }
  }

  if ("holderLimit" in body) {
    const n = Number(body.holderLimit);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      return NextResponse.json(
        { error: "holderLimit must be 1..500" },
        { status: 400 },
      );
    }
    patch.holderLimit = Math.floor(n);
  }

  if ("excludeAddresses" in body) {
    const v = body.excludeAddresses;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      return NextResponse.json(
        { error: "excludeAddresses must be string[]" },
        { status: 400 },
      );
    }
    const norm: string[] = [];
    for (const a of v as string[]) {
      try {
        norm.push(getAddress(a));
      } catch {
        return NextResponse.json(
          { error: `invalid exclude address: ${a}` },
          { status: 400 },
        );
      }
    }
    patch.excludeAddresses = norm;
  }

  if ("usdPriceId" in body) {
    const v = body.usdPriceId;
    if (typeof v !== "string") {
      return NextResponse.json(
        { error: "usdPriceId must be string" },
        { status: 400 },
      );
    }
    patch.usdPriceId = v;
  }

  const next = await setRuntimeConfig(patch);
  return NextResponse.json({ ok: true, config: next });
}
