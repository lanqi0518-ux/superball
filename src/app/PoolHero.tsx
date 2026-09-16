"use client";

import { useEffect, useState } from "react";

type PoolInfo = {
  configured: boolean;
  autoPayout?: boolean;
  symbol: string;
  native?: boolean;
  balance?: string;
  distributable?: string;
  reserve?: string;
  usdValue?: number | null;
  distributableUsd?: number | null;
  usdPrice?: number | null;
  walletAddress: string | null;
  walletExplorer?: string;
  chainId?: number;
  tokenAddress?: string | null;
  payoutBps: number;
  error?: string;
};

function formatNumber(n: number, maxFraction = 6): string {
  if (!isFinite(n)) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFraction });
}

function formatUsd(n: number | null | undefined): string | null {
  if (n == null || !isFinite(n)) return null;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(2) + "K";
  return "$" + n.toFixed(2);
}

function shortAddr(a: string): string {
  if (!a) return "";
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
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
        const j = (await r.json()) as PoolInfo;
        if (!cancelled) setInfo(j);
      } catch {}
    }
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const distNum = info?.distributable ? Number(info.distributable) : 0;
  const perRound =
    info && info.payoutBps > 0 ? distNum * (info.payoutBps / 10_000) : 0;
  const distUsd = formatUsd(info?.distributableUsd);
  const perRoundUsd = formatUsd(
    info?.distributableUsd != null
      ? info.distributableUsd * (info.payoutBps / 10_000)
      : null,
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
                  : info.configured
                    ? "border-amber-400/40 text-amber-300"
                    : "border-red-400/40 text-red-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  info.autoPayout
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                    : info.configured
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
              />
              {info.autoPayout
                ? "auto-payout armed"
                : info.configured
                  ? "read-only pool"
                  : "pool not configured"}
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
              {info?.configured
                ? formatNumber(distNum)
                : info == null
                  ? "…"
                  : "—"}
            </div>
            <div className="pb-2 text-2xl font-semibold text-white/70">
              {info?.symbol ?? "ETH"}
            </div>
          </div>
          {distUsd && (
            <div className="mt-2 flex flex-wrap items-baseline gap-3 text-lg text-white/50">
              <span>
                ≈ <span className="text-white/80">{distUsd}</span> USD
              </span>
              {info?.usdPrice != null && info.symbol && (
                <span className="mono text-xs text-white/40">
                  1 {info.symbol} ={" "}
                  {info.usdPrice.toLocaleString(undefined, {
                    maximumFractionDigits: info.usdPrice < 1 ? 6 : 2,
                  })}{" "}
                  USD
                </span>
              )}
            </div>
          )}
          {info?.configured && info.balance && (
            <div className="mono mt-3 text-xs text-white/40">
              Wallet balance{" "}
              <span className="text-white/70">
                {formatNumber(Number(info.balance))} {info.symbol}
              </span>{" "}
              · gas reserve{" "}
              <span className="text-white/70">
                {info.reserve} {info.symbol}
              </span>
            </div>
          )}
          {info?.error && (
            <div className="mt-3 text-sm text-red-300">
              RPC error: {info.error}
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat
              label="Paid this round"
              value={
                info?.configured
                  ? `${formatNumber(perRound)} ${info.symbol}`
                  : "—"
              }
              sub={perRoundUsd ? `≈ ${perRoundUsd}` : undefined}
              accent
            />
            <MiniStat
              label="Payout rate"
              value={
                info
                  ? `${(info.payoutBps / 100).toFixed(2)}% / round`
                  : "…"
              }
            />
            <MiniStat label="Cadence" value="every 3 min" />
          </div>

          {info?.walletAddress && (
            <div className="mono mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
              Pool wallet:
              {info.walletExplorer ? (
                <a
                  href={info.walletExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-[color:var(--gold-bright)] underline decoration-[color:var(--gold-bright)]/40 hover:decoration-[color:var(--gold-bright)]"
                >
                  {shortAddr(info.walletAddress)} ↗
                </a>
              ) : (
                <span className="break-all">
                  {shortAddr(info.walletAddress)}
                </span>
              )}
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
                style={{ width: 220, height: 220, fontSize: 88 }}
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
      {sub && <div className="mono mt-0.5 text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}
