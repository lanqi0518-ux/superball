import { promises as fs } from "node:fs";
import path from "node:path";

import type { Payout } from "./chain";

export type Settlement = {
  round: number;
  displayedRound: number;
  signature: string;
  winningNumber: number;
  totalBalance: string;
  distributable: string;
  paidTotal: string;
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

const STORE_PATH = process.env.SETTLEMENT_STORE_PATH ?? "/tmp/superball-settlements.json";

let settlements = new Map<number, Settlement>();
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const arr = JSON.parse(raw) as Settlement[];
    settlements = new Map(arr.map((s) => [s.round, s]));
  } catch {
    settlements = new Map();
  }
}

async function persist() {
  const arr = [...settlements.values()].sort((a, b) => a.round - b.round);
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(arr), "utf-8");
  } catch {}
}

export async function record(s: Settlement) {
  await ensureLoaded();
  settlements.set(s.round, s);
  await persist();
}

export async function has(round: number): Promise<boolean> {
  await ensureLoaded();
  return settlements.has(round);
}

export async function list(): Promise<Settlement[]> {
  await ensureLoaded();
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
