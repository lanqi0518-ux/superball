// In-memory settlement log (per-process). Fly free-tier single-machine setup
// is fine for a demo; for HA move this to Redis / Fly Postgres.

import type { Payout } from "./chain";

export type Settlement = {
  round: number;
  signature: string;
  winningNumber: number;
  totalPool: string; // pre-payout pool balance, stringified bigint
  paidTotal: string; // sum of amounts paid, stringified bigint
  payouts: {
    address: string;
    slots: number;
    winningSlots: number;
    amount: string;
    txHash?: string;
  }[];
  settledAt: number;
  auto: boolean;
};

const settlements = new Map<number, Settlement>();

export function record(s: Settlement) {
  settlements.set(s.round, s);
}

export function get(round: number): Settlement | undefined {
  return settlements.get(round);
}

export function has(round: number): boolean {
  return settlements.has(round);
}

export function list(): Settlement[] {
  return [...settlements.values()].sort((a, b) => b.round - a.round);
}

export function serializePayouts(
  payouts: Payout[],
  slotsByAddress: Record<string, { slots: number; winning: number }>,
): Settlement["payouts"] {
  return payouts.map((p) => {
    const info = slotsByAddress[p.to.toLowerCase()] ?? {
      slots: 0,
      winning: 0,
    };
    return {
      address: p.to,
      slots: info.slots,
      winningSlots: info.winning,
      amount: p.amount.toString(),
      txHash: p.txHash,
    };
  });
}
