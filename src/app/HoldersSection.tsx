"use client";

import { useEffect, useMemo, useState } from "react";
import type { DrawResult } from "@/lib/drand";
import {
  allocateAll,
  parseHolders,
  shortAddr,
  type Holder,
  type HolderAllocation,
} from "@/lib/holders";

const EXAMPLE = `# address, percent   (each 0.1% = 1 auto-assigned number)
0xA11ce0000000000000000000000000000000A11c, 12.5
0xB0b0000000000000000000000000000000000B0b, 7.3
0xCafe000000000000000000000000000000000Cafe, 3.1
0xDecaf00000000000000000000000000000000Dec, 1.0
0xFeed0000000000000000000000000000000000Fee, 0.4
0xBeef0000000000000000000000000000000000Bee, 0.1`;

export default function HoldersSection({ draw }: { draw: DrawResult | null }) {
  const [text, setText] = useState<string>(EXAMPLE);
  const [allocations, setAllocations] = useState<HolderAllocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holders: Holder[] = useMemo(() => {
    try {
      setError(null);
      return parseHolders(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "parse error");
      return [];
    }
  }, [text]);

  const totalPct = holders.reduce((n, h) => n + h.percent, 0);
  const totalSlots = holders.reduce(
    (n, h) => n + Math.floor(Math.round(h.percent * 100) / 10),
    0,
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!draw || holders.length === 0) {
        setAllocations([]);
        return;
      }
      setBusy(true);
      try {
        const res = await allocateAll(draw.signature, holders, draw.numbers);
        if (!cancelled) setAllocations(res);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [draw, holders]);

  const winners = allocations.filter((a) => a.matches > 0);
  const totalWinningSlots = winners.reduce((n, a) => n + a.matches, 0);

  return (
    <section className="panel p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="chip">Token Holder Draw</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Auto-assign numbers to your token holders
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/60">
            Every <span className="mono text-[color:var(--gold-bright)]">0.1%</span> of
            supply held earns one auto-assigned number from 1–50. A wallet
            holding 1% gets 10 numbers, 10% gets 100 numbers, and so on. The
            assignment is deterministic and re-derived each round from the
            drand signature — anyone can independently verify which numbers
            each address was assigned for round{" "}
            <span className="mono text-[color:var(--gold-bright)]">
              #{draw?.round ?? "…"}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-xs text-white/50">
          <span>
            Holders parsed:{" "}
            <span className="mono text-white">{holders.length}</span>
          </span>
          <span>
            Total supply:{" "}
            <span className="mono text-white">{totalPct.toFixed(2)}%</span>
          </span>
          <span>
            Total slots:{" "}
            <span className="mono text-[color:var(--gold-bright)]">
              {totalSlots}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
            Holder list
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="mono mt-2 h-72 w-full rounded-xl border border-[color:var(--panel-border)] bg-black/50 p-3 text-xs leading-relaxed text-white/80 outline-none focus:border-[color:var(--gold)]"
          />
          {error && (
            <p className="mt-2 text-xs text-red-300">Parse error: {error}</p>
          )}
          <p className="mt-2 text-xs text-white/40">
            Accepts <code className="mono">address,percent</code> per line, or
            a JSON array <code className="mono">[{`{address,percent}`}]</code>.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/40">
              Allocation & matches — round #{draw?.round ?? "…"}
            </label>
            {busy && (
              <span className="mono text-[10px] text-white/40">computing…</span>
            )}
          </div>

          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
            {allocations.length === 0 && (
              <p className="text-sm text-white/50">
                Paste holders on the left to see auto-assigned numbers.
              </p>
            )}
            {allocations.map((a) => (
              <HolderRow
                key={a.address}
                a={a}
                winning={new Set(draw?.numbers ?? [])}
              />
            ))}
          </div>

          {allocations.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--panel-border)] bg-black/30 px-4 py-3 text-sm">
              <span className="text-white/60">
                <span className="mono text-[color:var(--gold-bright)]">
                  {winners.length}
                </span>{" "}
                winning wallet{winners.length === 1 ? "" : "s"} this round
              </span>
              <span className="text-white/60">
                Winning slots:{" "}
                <span className="mono text-[color:var(--gold-bright)]">
                  {totalWinningSlots}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HolderRow({
  a,
  winning,
}: {
  a: HolderAllocation;
  winning: Set<number>;
}) {
  const [expanded, setExpanded] = useState(false);
  const showAll = expanded || a.numbers.length <= 20;
  const shown = showAll ? a.numbers : a.numbers.slice(0, 20);
  const winCls =
    a.matches > 0
      ? "border-[color:var(--gold)]/60 bg-[color:var(--gold)]/[0.06]"
      : "border-white/5 bg-white/[0.02]";
  return (
    <div className={`rounded-xl border ${winCls} px-3 py-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="mono text-white/80">{shortAddr(a.address)}</span>
          <span className="text-white/40">
            {a.percent.toFixed(2)}% · {a.slots} slot{a.slots === 1 ? "" : "s"}
          </span>
        </div>
        <span
          className={
            a.matches > 0
              ? "mono text-[color:var(--gold-bright)]"
              : "mono text-white/40"
          }
        >
          {a.matches} match{a.matches === 1 ? "" : "es"}
        </span>
      </div>
      {a.numbers.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {shown.map((n, idx) => {
            const isWin = winning.has(n);
            return (
              <span
                key={idx}
                className={`mono flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] ${
                  isWin
                    ? "bg-[color:var(--gold)] text-[#1a1200] shadow-[0_0_10px_rgba(242,217,141,0.6)]"
                    : "bg-white/5 text-white/60"
                }`}
              >
                {n}
              </span>
            );
          })}
          {!showAll && (
            <button
              onClick={() => setExpanded(true)}
              className="mono text-[10px] text-white/50 underline decoration-white/30 hover:text-[color:var(--gold-bright)]"
            >
              +{a.numbers.length - shown.length} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
