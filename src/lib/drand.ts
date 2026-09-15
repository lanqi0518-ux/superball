// drand (League of Entropy) — public, verifiable randomness beacon.
// Default chain: https://api.drand.sh (30s period, BLS threshold signatures).
// Every round's signature is deterministic and publicly verifiable, so anyone
// can independently re-derive the drawn numbers from (round, signature).

export const DRAND_BASE = "https://api.drand.sh";
export const DRAND_CHAIN_HASH =
  "8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce"; // League of Entropy mainnet
export const DRAND_PERIOD_SECONDS = 30;
export const DRAND_GENESIS = 1595431050; // seconds since epoch for round 1

export type DrandBeacon = {
  round: number;
  randomness: string;
  signature: string;
  previous_signature?: string;
};

export type DrandInfo = {
  public_key: string;
  period: number;
  genesis_time: number;
  hash: string;
  groupHash: string;
};

export function roundAt(unixSeconds: number): number {
  if (unixSeconds < DRAND_GENESIS) return 1;
  return Math.floor((unixSeconds - DRAND_GENESIS) / DRAND_PERIOD_SECONDS) + 1;
}

export function timeOfRound(round: number): number {
  return DRAND_GENESIS + (round - 1) * DRAND_PERIOD_SECONDS;
}

export async function fetchBeacon(round?: number): Promise<DrandBeacon> {
  const path = round ? `/public/${round}` : "/public/latest";
  const res = await fetch(`${DRAND_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`drand fetch failed: ${res.status}`);
  return res.json();
}

// Deterministic PRNG built on top of the beacon signature.
// SHA-256(signature || counter) — xoshiro-style would also work but a hash
// keeps verification trivial: anyone can reproduce the stream in any language.
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const buf = await crypto.subtle.digest("SHA-256", view.buffer);
  return new Uint8Array(buf);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function u32BE(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

async function nextUint32(
  seed: Uint8Array,
  counter: number,
): Promise<{ value: number; nextCounter: number }> {
  const material = new Uint8Array(seed.length + 4);
  material.set(seed, 0);
  material.set(u32BE(counter), seed.length);
  const digest = await sha256(material);
  const view = new DataView(digest.buffer);
  return { value: view.getUint32(0, false) >>> 0, nextCounter: counter + 1 };
}

// Unbiased bounded integer using rejection sampling on 32-bit chunks.
async function boundedInt(
  seed: Uint8Array,
  counter: number,
  bound: number,
): Promise<{ value: number; nextCounter: number }> {
  const limit = Math.floor(0x100000000 / bound) * bound;
  let c = counter;
  while (true) {
    const { value, nextCounter } = await nextUint32(seed, c);
    c = nextCounter;
    if (value < limit) return { value: value % bound, nextCounter: c };
  }
}

export type DrawResult = {
  round: number;
  signature: string;
  numbers: number[];
  poolSize: number;
  pickCount: number;
  drawnAt: number;
};

// Fisher–Yates over [1..poolSize], picking `pickCount` numbers, then sorted
// ascending for display. The main balls are ordered independently.
export async function deriveDraw(
  beacon: DrandBeacon,
  poolSize = 50,
  pickCount = 6,
): Promise<DrawResult> {
  const seed = await sha256(hexToBytes(beacon.signature));
  const pool = Array.from({ length: poolSize }, (_, i) => i + 1);
  let counter = 0;
  for (let i = pool.length - 1; i > pool.length - 1 - pickCount; i--) {
    const { value: j, nextCounter } = await boundedInt(seed, counter, i + 1);
    counter = nextCounter;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const numbers = pool.slice(pool.length - pickCount).sort((a, b) => a - b);
  return {
    round: beacon.round,
    signature: beacon.signature,
    numbers,
    poolSize,
    pickCount,
    drawnAt: timeOfRound(beacon.round),
  };
}
