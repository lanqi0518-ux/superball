export type Holder = {
  address: string;
  percent: number; // 0..100
};

export type HolderAllocation = {
  address: string;
  percent: number;
  slots: number;
  numbers: number[];
  matches: number;
};

// One "slot" per 0.1% of supply. 100% => 1000 slots.
export const SLOT_BP = 10; // basis points per slot (0.1%)

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

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const buf = await crypto.subtle.digest("SHA-256", view.buffer);
  return new Uint8Array(buf);
}

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// Deterministic, verifiable allocation:
//   number(holder, i) = 1 + (SHA-256(seed || address || u32(i))[:4] as u32) mod 50
// where seed = SHA-256(drand_signature). Anyone can reproduce it in any
// language from (round, holder-address, slot-index).
export async function allocateForHolder(
  signatureHex: string,
  address: string,
  slots: number,
  poolSize = 50,
): Promise<number[]> {
  const seed = await sha256(hexToBytes(signatureHex));
  const addrBytes = encodeUtf8(address.toLowerCase());
  const numbers: number[] = [];
  for (let i = 0; i < slots; i++) {
    const digest = await sha256(concat(seed, addrBytes, u32BE(i)));
    const view = new DataView(
      digest.buffer,
      digest.byteOffset,
      digest.byteLength,
    );
    const raw = view.getUint32(0, false) >>> 0;
    numbers.push(1 + (raw % poolSize));
  }
  return numbers;
}

export async function allocateAll(
  signatureHex: string,
  holders: Holder[],
  winning: number[],
): Promise<HolderAllocation[]> {
  const winSet = new Set(winning);
  const results: HolderAllocation[] = [];
  for (const h of holders) {
    const bp = Math.round(h.percent * 100); // percent -> basis points
    const slots = Math.floor(bp / SLOT_BP);
    const numbers = slots > 0
      ? await allocateForHolder(signatureHex, h.address, slots)
      : [];
    const matches = numbers.reduce((n, x) => n + (winSet.has(x) ? 1 : 0), 0);
    results.push({
      address: h.address,
      percent: h.percent,
      slots,
      numbers,
      matches,
    });
  }
  return results;
}

// Parses either JSON [{address, percent}] or lines "address,percent" / "address percent".
export function parseHolders(text: string): Holder[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const arr = Array.isArray(data) ? data : [data];
    return arr.map((h) => ({
      address: String(h.address ?? h.addr ?? h.wallet ?? "").trim(),
      percent: Number(h.percent ?? h.pct ?? h.share ?? 0),
    }));
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [addr, pct] = line.split(/[,\s]+/);
      return { address: (addr ?? "").trim(), percent: Number(pct ?? 0) };
    })
    .filter((h) => h.address && Number.isFinite(h.percent));
}

export function shortAddr(a: string): string {
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
