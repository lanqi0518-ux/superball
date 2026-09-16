"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawResult } from "@/lib/drand";
import HoldersSection from "./HoldersSection";
import PoolHero from "./PoolHero";
import AutoPayoutSection from "./AutoPayoutSection";

type BeaconMeta = {
  now: number;
  beaconRound: number;
  currentRound: number;
  nextRound: number;
  displayedCurrentRound: number;
  displayedNextRound: number;
  roundOffset: number;
  currentDrawAt: number;
  nextDrawAt: number;
  drawIntervalSeconds: number;
  beaconPeriod: number;
  genesis: number;
  chainHash: string;
};

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "settling…";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export default function HomeClient({
  initialDraw,
}: {
  initialDraw: DrawResult | null;
}) {
  const [draw, setDraw] = useState<DrawResult | null>(initialDraw);
  const [meta, setMeta] = useState<BeaconMeta | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [history, setHistory] = useState<DrawResult[]>(
    initialDraw ? [initialDraw] : [],
  );
  const [reveal, setReveal] = useState<number>(initialDraw?.numbers.length ?? 0);
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  const lastRoundRef = useRef<number>(initialDraw?.round ?? 0);

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
      if (!drawing) runDraw();
    }
  }, [now, meta, drawing, fetchMeta, runDraw]);

  const secondsToNext = meta
    ? Math.max(0, meta.nextDrawAt + 2 - now)
    : null;

  const revealed = draw ? draw.numbers.slice(0, reveal) : [];
  const winningNumber = revealed[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 md:py-14">
      <Header />

      <PoolHero
        countdown={
          secondsToNext === null ? "…" : formatCountdown(secondsToNext)
        }
        drawing={drawing}
        winningNumber={winningNumber}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Current round"
          value={meta ? `#${meta.displayedCurrentRound}` : "…"}
        />
        <Stat
          label="Next round"
          value={meta ? `#${meta.displayedNextRound}` : "…"}
          accent
        />
        <Stat
          label="drand beacon"
          value={meta ? `#${meta.beaconRound}` : "…"}
        />
      </div>

      <HoldersSection draw={draw} />

      <AutoPayoutSection />

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
            Superball · 1 / 50 · every 3 min
          </span>
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="gold-text">Provably fair</span> draws,
          <br className="hidden sm:block" /> assigned to your holders.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/60 sm:text-base">
          Every 3 minutes the drand League of Entropy beacon produces one
          winning number from 1–50 and re-assigns numbers to every token
          holder. Each 0.1% of supply held earns one auto-assigned number — a
          wallet with 1% gets 10 numbers, 10% gets 100. Anyone can
          independently reproduce both the winning number and each holder's
          allocation from the round signature alone.
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

function FairnessSection({ draw }: { draw: DrawResult | null }) {
  return (
    <section className="panel p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="chip">Provably Fair</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            How every result is verifiable
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            We do not roll the dice, and we do not choose who gets which
            number. Every 3 minutes we fetch the BLS threshold signature
            produced by the drand network — the same beacon that powers
            Filecoin leader election and the League of Entropy. From that
            single signature we deterministically derive (a) the winning
            number and (b) each holder&apos;s allocation. Anyone can reproduce
            both in any language.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Step
          n="01"
          title="Fetch signed round"
          body="GET api.drand.sh/public/{round} returns a BLS signature validated against the League of Entropy public key. We only accept rounds on a 3-minute boundary."
        />
        <Step
          n="02"
          title="Draw the winning number"
          body="seed = SHA-256(signature). Winning number = 1 + rejection-sampled uint32 mod 50 — no modulo bias, uniform distribution guaranteed."
        />
        <Step
          n="03"
          title="Assign holder numbers"
          body="For each holder address, slot i (i < floor(pct / 0.1%)) is assigned 1 + SHA-256(seed || address || u32(i)) mod 50."
        />
      </div>

      {draw && (
        <div className="mt-6 rounded-xl border border-[color:var(--panel-border)] bg-black/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
            <span className="uppercase tracking-[0.18em]">
              Round #{draw.displayedRound ?? draw.round} · drand #{draw.round} signature
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
              <span className="mono text-xs text-white/50">
                #{d.displayedRound ?? d.round}
              </span>
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
                    width: 40,
                    height: 40,
                    fontSize: 15,
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
