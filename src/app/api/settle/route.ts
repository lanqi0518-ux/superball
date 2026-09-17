import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getAddress } from "viem";
import {
  currentDrawRound,
  deriveDraw,
  fetchBeacon,
} from "@/lib/drand";
import {
  distributable,
  loadConfig,
  payWinners,
  readPoolBalance,
  type Payout,
} from "@/lib/chain";
import { allocateAll, parseHolders, type Holder } from "@/lib/holders";
import { getSnapshotCached, loadSnapshotConfig } from "@/lib/tokenHolders";
import {
  has,
  list,
  record,
  serializePayouts,
} from "@/lib/settlementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function offset(): number {
  return Number(process.env.POOL_ROUND_OFFSET ?? "0");
}

// In-memory lock so concurrent cron POSTs for the same round don't race
// on the wallet nonce. Second concurrent call returns {locked:true}.
const inFlight = new Set<number>();

export async function GET() {
  return NextResponse.json({ settlements: (await list()).slice(0, 20) });
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
          "Chain not fully configured. Need POOL_CHAIN_ID, POOL_RPC_URL, POOL_WALLET_ADDRESS, POOL_WALLET_PRIVATE_KEY (and POOL_TOKEN_ADDRESS if not native).",
      },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { holders?: string };

  let holders: Holder[] = [];
  let holderSource = "manual";
  const snap = await loadSnapshotConfig();
  if (body.holders) {
    holders = parseHolders(body.holders);
    holderSource = "request";
  } else if (snap) {
    try {
      const snapshot = await getSnapshotCached(snap);
      holders = snapshot.holders;
      holderSource = "onchain-snapshot";
    } catch (err) {
      return NextResponse.json(
        {
          error:
            "On-chain snapshot failed: " +
            (err instanceof Error ? err.message : "unknown"),
        },
        { status: 502 },
      );
    }
  } else {
    holders = parseHolders(process.env.POOL_HOLDERS ?? "");
    holderSource = "POOL_HOLDERS";
  }
  if (holders.length === 0) {
    return NextResponse.json(
      {
        error:
          "No holders available. Set POOL_HOLDER_TOKEN_ADDRESS for auto-snapshot, or POOL_HOLDERS, or pass body.holders.",
      },
      { status: 400 },
    );
  }

  const round = currentDrawRound(Math.floor(Date.now() / 1000));
  if (await has(round)) {
    return NextResponse.json({
      skipped: true,
      reason: "already settled",
      round,
    });
  }
  if (inFlight.has(round)) {
    return NextResponse.json({
      skipped: true,
      reason: "settlement in progress on another request",
      round,
    });
  }
  inFlight.add(round);
  try {

  const beacon = await fetchBeacon(round);
  const draw = await deriveDraw(beacon);
  const winningNumber = draw.numbers[0];

  const allocations = await allocateAll(
    draw.signature,
    holders,
    draw.numbers,
  );

  // Winners = unique addresses with at least one matching slot.
  const winners: { address: Address; slots: number; winning: number }[] = [];
  for (const a of allocations) {
    if (a.matches === 0) continue;
    try {
      const to = getAddress(a.address);
      winners.push({ address: to, slots: a.slots, winning: a.matches });
    } catch {}
  }

  const totalBalance = await readPoolBalance(cfg);
  const dist = distributable(totalBalance, cfg);
  const roundPool = (dist * BigInt(cfg.payoutBps)) / 10_000n;

  const payouts: Payout[] = [];
  const slotsByAddress: Record<
    string,
    { slots: number; winning: number }
  > = {};
  if (winners.length > 0 && roundPool > 0n) {
    // Split evenly per winning address.
    const per = roundPool / BigInt(winners.length);
    for (const w of winners) {
      payouts.push({ to: w.address, amount: per });
      slotsByAddress[w.address.toLowerCase()] = {
        slots: w.slots,
        winning: w.winning,
      };
    }
  }

  const paid = await payWinners(cfg, payouts);
  const paidTotal = paid.reduce(
    (n, p) => (p.txHash ? n + p.amount : n),
    0n,
  );

  const settlement = {
    round,
    displayedRound: round - offset(),
    signature: draw.signature,
    winningNumber,
    totalBalance: totalBalance.toString(),
    distributable: dist.toString(),
    paidTotal: paidTotal.toString(),
    payouts: serializePayouts(paid, slotsByAddress),
    settledAt: Math.floor(Date.now() / 1000),
    auto: true,
    holderSource,
    holderCount: holders.length,
  };
  await record(settlement);

  return NextResponse.json({ ok: true, settlement });
  } finally {
    inFlight.delete(round);
  }
}
