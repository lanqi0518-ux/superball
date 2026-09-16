import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getAddress } from "viem";
import {
  currentDrawRound,
  deriveDraw,
  fetchBeacon,
} from "@/lib/drand";
import {
  loadConfig,
  payWinners,
  readPoolBalance,
  type Payout,
} from "@/lib/chain";
import { allocateAll, parseHolders } from "@/lib/holders";
import {
  has,
  list,
  record,
  serializePayouts,
} from "@/lib/settlementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/settle          → list past settlements
// POST /api/settle          → settle the current draw round (idempotent per round).
//   Auth: Authorization: Bearer <SETTLE_SECRET>
//   Body (optional): { holders: "address,percent\n..." }
//   If body omitted, POOL_HOLDERS env var is used.

export async function GET() {
  return NextResponse.json({ settlements: list().slice(0, 20) });
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.SETTLE_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = loadConfig();
  if (!cfg.configured || !cfg.keyLoaded) {
    return NextResponse.json(
      {
        error:
          "Chain not fully configured. Need POOL_CHAIN_ID, POOL_RPC_URL, POOL_TOKEN_ADDRESS, POOL_WALLET_ADDRESS, POOL_WALLET_PRIVATE_KEY.",
      },
      { status: 400 },
    );
  }

  const body = (await req
    .json()
    .catch(() => ({}))) as { holders?: string };
  const holdersText = body.holders ?? process.env.POOL_HOLDERS ?? "";
  const holders = parseHolders(holdersText);
  if (holders.length === 0) {
    return NextResponse.json(
      { error: "No holders provided (body.holders or POOL_HOLDERS)" },
      { status: 400 },
    );
  }

  const round = currentDrawRound(Math.floor(Date.now() / 1000));
  if (has(round)) {
    return NextResponse.json({
      skipped: true,
      reason: "already settled",
      round,
    });
  }

  const beacon = await fetchBeacon(round);
  const draw = await deriveDraw(beacon);
  const winning = new Set(draw.numbers);
  const winningNumber = draw.numbers[0];

  const allocations = await allocateAll(
    draw.signature,
    holders,
    draw.numbers,
  );

  const totalWinningSlots = allocations.reduce((n, a) => n + a.matches, 0);
  const pool = await readPoolBalance(cfg);
  const roundPool = (pool * BigInt(cfg.payoutBpsPerRound)) / 10_000n;

  const slotsByAddress: Record<
    string,
    { slots: number; winning: number }
  > = {};
  const payouts: Payout[] = [];
  if (totalWinningSlots > 0 && roundPool > 0n) {
    for (const a of allocations) {
      if (a.matches === 0) continue;
      let to: Address;
      try {
        to = getAddress(a.address);
      } catch {
        continue;
      }
      const amount =
        (roundPool * BigInt(a.matches)) / BigInt(totalWinningSlots);
      payouts.push({ to, amount });
      slotsByAddress[to.toLowerCase()] = {
        slots: a.slots,
        winning: a.matches,
      };
    }
  }

  const paid = await payWinners(cfg, payouts);
  const paidTotal = paid.reduce((n, p) => n + p.amount, 0n);

  const settlement = {
    round,
    signature: draw.signature,
    winningNumber,
    totalPool: pool.toString(),
    paidTotal: paidTotal.toString(),
    payouts: serializePayouts(paid, slotsByAddress),
    settledAt: Math.floor(Date.now() / 1000),
    auto: true,
  };
  record(settlement);

  return NextResponse.json({ ok: true, settlement });
}
