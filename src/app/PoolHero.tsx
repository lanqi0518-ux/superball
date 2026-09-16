"use client";

import { useEffect, useState } from "react";

type PoolInfo = {
  configured: boolean;
  demo?: boolean;
  autoPayout?: boolean;
  symbol: string;
  balance: string;
  usdValue: number | null;
  walletAddress: string | null;
  payoutBps: number;
  chainId?: number;
  tokenAddress?: string;
};

function formatNumber(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(n: number | null): string | null {
  if (n == null || !isFinite(n)) return null;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(2) + "K";
  return "$" + n.toFixed(2);
}

export default function PoolHero({
  countdown,
  drawing,
  winningNumber,
}: {
  countdown: string;
  drawing: boolean;
  winningNumber?: number;
}) {
  const [info, setInfo] = useState<PoolInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/pool", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as PoolInfo;
        if (!cancelled) setInfo(j);
      } catch {}
    }
    load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const balance = info ? Number(info.balance) : 0;
  const perRound =
    info && info.payoutBps > 0 ? balance * (info.payoutBps / 10_000) : 0;
  const usd = formatUsd(info?.usdValue ?? null);
  const perRoundUsd = formatUsd(
    info?.usdValue != null ? info.usdValue * (info.payoutBps / 10_000) : null,
  );

  return (
    <section className="panel relative overflow-hidden p-6 md:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(600px 400px at 20% 0%, rgba(242,217,141,0.18), transparent 60%), radial-gradient(500px 400px at 100% 100%, rgba(212,178,106,0.12), transparent 60%)",
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="chip">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                drawing
                  ? "bg-[color:var(--gold-bright)] shadow-[0_0_8px_rgba(242,217,141,0.9)] animate-pulse"
                  : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
              }`}
            />
            {drawing ? "Drawing…" : "Live · auto-drawing"}
          </div>
          {info && (
            <span
              className={`chip ${
                info.autoPayout
                  ? "border-emerald-400/40 text-emerald-300"
                  : ""
              }`}
              title={
                info.autoPayout
                  ? "Hot-wallet auto-payout is armed."
                  : info.configured
                    ? "Pool wallet configured (read-only). Set POOL_WALLET_PRIVATE_KEY to enable auto-payout."
                    : "Pool is running in demo mode. Configure POOL_* env vars to go live."
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  info.autoPayout
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                    : "bg-amber-400"
                }`}
              />
              {info.autoPayout
                ? "auto-payout armed"
                : info.configured
                  ? "read-only pool"
                  : "demo pool"}
            </span>
          )}
        </div>
        <div className="mono text-xs text-white/40">
          Next draw in{" "}
          <span className="text-[color:var(--gold-bright)]">{countdown}</span>
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">
            Prize pool
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <div
              className="gold-text font-black leading-none tracking-tight"
              style={{ fontSize: "clamp(56px, 12vw, 160px)" }}
            >
              {formatNumber(balance)}
            </div>
            <div className="pb-2 text-2xl font-semibold text-white/70">
              {info?.symbol ?? "TOKEN"}
            </div>
          </div>
          {usd && (
            <div className="mt-2 text-lg text-white/50">
              ≈ <span className="text-white/80">{usd}</span> USD
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat
              label="Paid this round"
              value={`${formatNumber(perRound)} ${info?.symbol ?? ""}`}
              sub={perRoundUsd ? `≈ ${perRoundUsd}` : undefined}
              accent
            />
            <MiniStat
              label="Payout rate"
              value={
                info
                  ? `${(info.payoutBps / 100).toFixed(2)}% / round`
                  : "1% / round"
              }
            />
            <MiniStat
              label="Cadence"
              value="every 3 min"
            />
          </div>

          {info?.walletAddress && (
            <div className="mono mt-4 break-all text-[11px] text-white/40">
              Pool wallet: {info.walletAddress}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-full opacity-70 blur-2xl"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(242,217,141,0.55), transparent 70%)",
              }}
            />
            {winningNumber ? (
              <div
                className="ball ball-drawn relative"
                style={{
                  width: 220,
                  height: 220,
                  fontSize: 88,
                }}
              >
                {winningNumber}
              </div>
            ) : (
              <div
                className="ball ball-idle opacity-50"
                style={{ width: 220, height: 220, fontSize: 80 }}
              >
                ?
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div
        className={`mono mt-1 text-lg font-semibold ${
          accent ? "text-[color:var(--gold-bright)]" : "text-white"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="mono mt-0.5 text-[11px] text-white/40">{sub}</div>
      )}
    </div>
  );
}
