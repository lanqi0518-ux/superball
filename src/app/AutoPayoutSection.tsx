"use client";

import { useEffect, useState } from "react";

type Payout = {
  address: string;
  slots: number;
  winningSlots: number;
  amount: string;
  txHash?: string;
};

type Settlement = {
  round: number;
  displayedRound?: number;
  winningNumber: number;
  paidTotal: string;
  totalBalance: string;
  distributable: string;
  settledAt: number;
  payouts: Payout[];
  holderSource?: string;
  holderCount?: number;
};

type PoolInfo = {
  configured: boolean;
  autoPayout?: boolean;
  symbol: string;
  walletAddress: string | null;
  walletExplorer?: string;
  chainId?: number;
  payoutBps: number;
  usdPrice?: number | null;
};

function shortAddr(a: string): string {
  if (!a) return "";
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function weiToEth(wei: string): number {
  try {
    const n = BigInt(wei);
    // 6-digit precision is enough for display
    const scaled = Number(n / 10_000_000_000n) / 1e8;
    return scaled;
  } catch {
    return 0;
  }
}

function formatEth(eth: number): string {
  if (!isFinite(eth) || eth === 0) return "0";
  if (eth < 0.0001) return eth.toExponential(2);
  return eth.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatUsd(n: number | null | undefined): string | null {
  if (n == null || !isFinite(n)) return null;
  if (n >= 1000) return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}

function txExplorer(chainId: number | undefined, hash: string): string {
  if (chainId === 4663) return `https://robinhoodchain.blockscout.com/tx/${hash}`;
  return "";
}

function addrExplorer(chainId: number | undefined, addr: string): string {
  if (chainId === 4663)
    return `https://robinhoodchain.blockscout.com/address/${addr}`;
  return "";
}

export default function AutoPayoutSection() {
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [p, s] = await Promise.all([
          fetch("/api/pool", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/settle", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setPool(p);
        setSettlements(s.settlements ?? []);
      } catch {}
    }
    load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const armed = Boolean(pool?.autoPayout);
  const configured = Boolean(pool?.configured);
  const symbol = pool?.symbol ?? "ETH";
  const usdPrice = pool?.usdPrice ?? null;

  return (
    <section className="panel p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="chip">Recent Draws</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            开奖记录
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            每 3 分钟自动结算一轮，命中当轮开奖号的持仓地址平分本轮奖池 — 全部由热钱包链上自动打款。
          </p>
        </div>
        <div
          className={`chip ${
            armed
              ? "border-emerald-400/40 text-emerald-300"
              : configured
                ? "border-amber-400/40 text-amber-300"
                : "border-red-400/40 text-red-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              armed
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                : configured
                  ? "bg-amber-400"
                  : "bg-red-400"
            }`}
          />
          {armed ? "自动打款已武装" : configured ? "只读模式" : "未配置"}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {settlements.length === 0 && (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/50">
            还没有结算记录。等下一次 <span className="mono text-[color:var(--gold-bright)]">/api/settle</span> 触发后会自动出现。
          </div>
        )}
        {settlements.map((s) => (
          <SettlementCard
            key={s.round}
            s={s}
            symbol={symbol}
            usdPrice={usdPrice}
            chainId={pool?.chainId}
          />
        ))}
      </div>
    </section>
  );
}

function SettlementCard({
  s,
  symbol,
  usdPrice,
  chainId,
}: {
  s: Settlement;
  symbol: string;
  usdPrice: number | null;
  chainId?: number;
}) {
  const winners = s.payouts.filter((p) => p.winningSlots > 0);
  const paidEth = weiToEth(s.paidTotal);
  const distEth = weiToEth(s.distributable);
  const perWinnerEth = winners.length > 0 ? paidEth / winners.length : 0;
  const perWinnerUsd = usdPrice != null ? perWinnerEth * usdPrice : null;
  const paidUsd = usdPrice != null ? paidEth * usdPrice : null;
  const displayedRound = s.displayedRound ?? s.round;

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-[color:var(--panel-border)]">
      <div className="flex flex-wrap items-center gap-4">
        {/* Winning ball */}
        <div
          className="ball ball-drawn"
          style={{ width: 56, height: 56, fontSize: 22, animation: "none" }}
        >
          {s.winningNumber}
        </div>

        <div className="flex-1 min-w-[180px]">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-semibold">
              第 <span className="mono text-[color:var(--gold-bright)]">#{displayedRound}</span> 轮
            </span>
            <span className="mono text-xs text-white/40">
              {new Date(s.settledAt * 1000).toLocaleString()}
            </span>
          </div>
          <div className="mt-1 text-sm text-white/60">
            {winners.length > 0 ? (
              <>
                <span className="mono text-[color:var(--gold-bright)]">
                  {winners.length}
                </span>{" "}
                位中奖 · 每人{" "}
                <span className="mono text-white">
                  {formatEth(perWinnerEth)} {symbol}
                </span>
                {perWinnerUsd != null && (
                  <>
                    {" "}
                    <span className="text-white/40">
                      ({formatUsd(perWinnerUsd)})
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-white/40">本轮无中奖者</span>
            )}
          </div>
        </div>

        <div className="text-right text-xs text-white/40">
          <div>
            本轮奖池{" "}
            <span className="mono text-white/70">
              {formatEth(distEth)} {symbol}
            </span>
          </div>
          {paidUsd != null && (
            <div className="mono text-white/40">
              已发放 {formatUsd(paidUsd)}
            </div>
          )}
        </div>
      </div>

      {winners.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
          {winners.map((p, i) => {
            const eth = weiToEth(p.amount);
            const usd = usdPrice != null ? eth * usdPrice : null;
            const addrLink = addrExplorer(chainId, p.address);
            const txLink = p.txHash ? txExplorer(chainId, p.txHash) : "";
            return (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  {addrLink ? (
                    <a
                      href={addrLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-white/80 underline decoration-white/20 hover:text-[color:var(--gold-bright)] hover:decoration-[color:var(--gold-bright)]"
                    >
                      {shortAddr(p.address)}
                    </a>
                  ) : (
                    <span className="mono text-white/80">
                      {shortAddr(p.address)}
                    </span>
                  )}
                  <span className="mono text-[10px] text-white/40">
                    {p.winningSlots}/{p.slots} 号中奖
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono text-[color:var(--gold-bright)]">
                    {formatEth(eth)} {symbol}
                  </span>
                  {usd != null && (
                    <span className="mono text-xs text-white/40">
                      ({formatUsd(usd)})
                    </span>
                  )}
                  {txLink && (
                    <a
                      href={txLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[10px] text-white/40 underline decoration-white/20 hover:text-[color:var(--gold-bright)] hover:decoration-[color:var(--gold-bright)]"
                    >
                      tx ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
