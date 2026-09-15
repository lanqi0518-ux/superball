"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DrawResult } from "@/lib/drand";
import HoldersSection from "./HoldersSection";

const POOL = Array.from({ length: 50 }, (_, i) => i + 1);
const PICK = 6;

type BeaconMeta = {
  now: number;
  currentRound: number;
  nextRound: number;
  nextDrawAt: number;
  period: number;
  genesis: number;
  chainHash: string;
};

export default function HomeClient({
  initialDraw,
}: {
  initialDraw: DrawResult | null;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [draw, setDraw] = useState<DrawResult | null>(initialDraw);
  const [meta, setMeta] = useState<BeaconMeta | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [autoDraw, setAutoDraw] = useState(true);
  const [history, setHistory] = useState<DrawResult[]>(
    initialDraw ? [initialDraw] : [],
  );
  const [reveal, setReveal] = useState<number>(initialDraw?.numbers.length ?? 0);
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  const lastRoundRef = useRef<number>(initialDraw?.round ?? 0);

  const toggle = (n: number) => {
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= PICK) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const quickPick = () => {
    const pool = [...POOL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setSelected(pool.slice(0, PICK).sort((a, b) => a - b));
  };

  const clearAll = () => setSelected([]);

  const fetchMeta = useCallback(async () => {
    try {
      const r = await fetch("/api/beacon", { cache: "no-store" });
      if (r.ok) setMeta(await r.json());
    } catch {}
  }, []);

  const runDraw = useCallback(async () => {
    setDrawing(true);
    setReveal(0);
    try {
      const r = await fetch("/api/draw", { cache: "no-store" });
      if (!r.ok) return;
      const d: DrawResult = await r.json();
      if (d.round === lastRoundRef.current) {
        setReveal(d.numbers.length);
        setDrawing(false);
        return;
      }
      lastRoundRef.current = d.round;
      setDraw(d);
      setHistory((h) => [d, ...h.filter((x) => x.round !== d.round)].slice(0, 8));
      for (let i = 1; i <= d.numbers.length; i++) {
        await new Promise((res) => setTimeout(res, 420));
        setReveal(i);
      }
    } finally {
      setDrawing(false);
    }
  }, []);

  useEffect(() => {
    fetchMeta();
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 250);
    return () => clearInterval(t);
  }, [fetchMeta]);

  useEffect(() => {
    if (!meta) return;
    if (now >= meta.nextDrawAt + 2) {
      fetchMeta();
      if (autoDraw && !drawing) runDraw();
    }
  }, [now, meta, autoDraw, drawing, fetchMeta, runDraw]);

  const secondsToNext = meta
    ? Math.max(0, meta.nextDrawAt + 2 - now)
    : null;

  const matches = useMemo(() => {
    if (!draw) return new Set<number>();
    const s = new Set(selected);
    return new Set(draw.numbers.filter((n) => s.has(n)));
  }, [draw, selected]);

  const revealed = draw ? draw.numbers.slice(0, reveal) : [];
  const placeholders = draw ? draw.numbers.length - reveal : PICK;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 md:py-14">
      <Header />

      <section className="grid gap-6 md:grid-cols-[1.15fr_1fr]">
        <div className="panel p-6 md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="chip">Live Draw</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                Latest winning numbers
              </h2>
              <p className="mt-1 text-sm text-white/60">
                Derived from drand round{" "}
                <span className="mono text-[color:var(--gold-bright)]">
                  #{draw?.round ?? "…"}
                </span>
                .
              </p>
            </div>
            <button
              onClick={runDraw}
              disabled={drawing}
              className="btn-primary text-sm"
            >
              {drawing ? "Drawing…" : "Draw now"}
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {revealed.map((n) => (
              <DrawnBall
                key={n}
                n={n}
                highlight={matches.has(n)}
                size={64}
              />
            ))}
            {Array.from({ length: placeholders }).map((_, i) => (
              <div
                key={`ph-${i}`}
                className="ball ball-idle opacity-40"
                style={{ width: 64, height: 64, fontSize: 20 }}
              >
                ?
              </div>
            ))}
          </div>

          <div className="divider my-8" />

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Next round" value={meta ? `#${meta.nextRound}` : "…"} />
            <Stat
              label="Countdown"
              value={
                secondsToNext === null
                  ? "…"
                  : secondsToNext > 0
                    ? `${secondsToNext}s`
                    : "settling…"
              }
              accent
            />
            <Stat
              label="Beacon period"
              value={meta ? `${meta.period}s` : "30s"}
            />
          </div>

          <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm text-white/70">
            <input
              type="checkbox"
              checked={autoDraw}
              onChange={(e) => setAutoDraw(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--gold)]"
            />
            Auto-draw the moment each new drand round is available
          </label>
        </div>

        <div className="panel p-6 md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="chip">Your Ticket</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Pick {PICK} of 50
              </h2>
              <p className="mt-1 text-sm text-white/60">
                {selected.length}/{PICK} selected
                {matches.size > 0 && (
                  <>
                    {" · "}
                    <span className="text-[color:var(--gold-bright)]">
                      {matches.size} match{matches.size === 1 ? "" : "es"}
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={quickPick} className="btn-ghost text-sm">
                Quick pick
              </button>
              <button
                onClick={clearAll}
                className="btn-ghost text-sm"
                disabled={selected.length === 0}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-8 gap-2 sm:grid-cols-10">
            {POOL.map((n) => {
              const isSelected = selected.includes(n);
              const isMatch = matches.has(n);
              return (
                <button
                  key={n}
                  onClick={() => toggle(n)}
                  className={`ball ${isSelected ? "ball-selected" : "ball-idle"} ${
                    isMatch ? "ball-match" : ""
                  }`}
                  style={{ width: 40, height: 40, fontSize: 14 }}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="divider my-6" />
          <ResultSummary
            selected={selected}
            draw={draw}
            matches={matches.size}
          />
        </div>
      </section>

      <HoldersSection draw={draw} />

      <FairnessSection draw={draw} />

      <HistorySection history={history} />

      <footer className="mt-6 pb-4 text-center text-xs text-white/40">
        Randomness by{" "}
        <a
          className="underline decoration-white/20 hover:text-[color:var(--gold-bright)]"
          href="https://drand.love"
          target="_blank"
          rel="noreferrer"
        >
          drand · League of Entropy
        </a>
        . No wallet, no house edge on the RNG — the signature is the entropy.
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <Logo />
          <span className="mono text-[11px] uppercase tracking-[0.3em] text-white/50">
            Superball · 6 / 50
          </span>
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="gold-text">Provably fair</span> draws,
          <br className="hidden sm:block" /> settled every 30 seconds.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/60 sm:text-base">
          Every winning combination is derived from a public, threshold-signed
          randomness beacon operated by the League of Entropy. Anyone — you
          included — can independently reproduce the result from the round
          number alone.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="chip">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          Beacon live
        </div>
        <span className="mono text-[11px] text-white/40">
          chain 8990e7…1b2ce
        </span>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--panel-border)] bg-gradient-to-br from-[#f4d377] to-[#8a6522] shadow-[0_6px_20px_rgba(212,178,106,0.35)]">
      <span className="text-lg font-black text-[#1a1200]">S</span>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div
        className={`mono mt-1 text-xl font-semibold ${
          accent ? "text-[color:var(--gold-bright)]" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DrawnBall({
  n,
  highlight,
  size,
}: {
  n: number;
  highlight: boolean;
  size: number;
}) {
  return (
    <div
      className={`ball ball-drawn ${highlight ? "ball-match" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {n}
    </div>
  );
}

function ResultSummary({
  selected,
  draw,
  matches,
}: {
  selected: number[];
  draw: DrawResult | null;
  matches: number;
}) {
  if (!draw) {
    return (
      <p className="text-sm text-white/50">
        Waiting for the first beacon round…
      </p>
    );
  }
  if (selected.length === 0) {
    return (
      <p className="text-sm text-white/50">
        Pick numbers above (or use Quick pick) to check them against round
        <span className="mono text-[color:var(--gold-bright)]"> #{draw.round}</span>.
      </p>
    );
  }
  const tier = tierFor(matches);
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
          Round #{draw.round} result
        </div>
        <div className="mt-1 text-lg font-semibold">
          {matches} of {PICK} matched · <span className="gold-text">{tier}</span>
        </div>
      </div>
      <div className="mono text-xs text-white/40">
        drawn {new Date(draw.drawnAt * 1000).toLocaleTimeString()}
      </div>
    </div>
  );
}

function tierFor(m: number): string {
  if (m === 6) return "Jackpot";
  if (m === 5) return "Second tier";
  if (m === 4) return "Third tier";
  if (m === 3) return "Consolation";
  return "No prize";
}

function FairnessSection({ draw }: { draw: DrawResult | null }) {
  return (
    <section className="panel p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="chip">Provably Fair</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            How this draw is verifiable
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/60">
            We do not roll the dice. Each round we pull the BLS threshold
            signature produced by the drand network — the same beacon that
            powers Filecoin leader election, League of Entropy consumers, and
            dozens of public randomness applications. From that signature we
            deterministically derive 6 unbiased numbers from 1–50 with a
            SHA-256-seeded Fisher–Yates shuffle and rejection sampling. Anyone
            can reproduce the exact same numbers.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Step
          n="01"
          title="Fetch signed round"
          body="GET api.drand.sh/public/{round} returns a BLS signature validated against the League of Entropy public key."
        />
        <Step
          n="02"
          title="Seed the shuffle"
          body="seed = SHA-256(signature). Since neither we nor any single operator can forge the signature, the seed is unpredictable and non-manipulable."
        />
        <Step
          n="03"
          title="Draw the balls"
          body="Fisher–Yates over 1..50 using rejection sampling on SHA-256(seed || counter) — no modulo bias, uniform distribution guaranteed."
        />
      </div>

      {draw && (
        <div className="mt-6 rounded-xl border border-[color:var(--panel-border)] bg-black/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
            <span className="uppercase tracking-[0.18em]">
              Round #{draw.round} signature
            </span>
            <a
              href={`https://api.drand.sh/public/${draw.round}`}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--gold-bright)] underline decoration-[color:var(--gold-bright)]/40 hover:decoration-[color:var(--gold-bright)]"
            >
              Verify at api.drand.sh ↗
            </a>
          </div>
          <p className="mono mt-2 break-all text-[11px] leading-relaxed text-white/70">
            {draw.signature}
          </p>
        </div>
      )}
    </section>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="mono text-[11px] tracking-[0.2em] text-[color:var(--gold-bright)]">
        {n}
      </div>
      <div className="mt-2 text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-white/60">{body}</p>
    </div>
  );
}

function HistorySection({ history }: { history: DrawResult[] }) {
  if (history.length <= 1) return null;
  return (
    <section className="panel p-6 md:p-8">
      <div className="chip">History</div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">
        Recent rounds
      </h2>
      <div className="mt-5 space-y-3">
        {history.map((d) => (
          <div
            key={d.round}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="mono text-xs text-white/50">#{d.round}</span>
              <span className="mono text-xs text-white/40">
                {new Date(d.drawnAt * 1000).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {d.numbers.map((n) => (
                <div
                  key={n}
                  className="ball ball-drawn"
                  style={{
                    width: 34,
                    height: 34,
                    fontSize: 13,
                    animation: "none",
                  }}
                >
                  {n}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
