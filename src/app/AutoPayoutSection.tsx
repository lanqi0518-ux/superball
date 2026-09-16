"use client";

import { useEffect, useState } from "react";

type Settlement = {
  round: number;
  winningNumber: number;
  paidTotal: string;
  totalPool: string;
  settledAt: number;
  payouts: {
    address: string;
    slots: number;
    winningSlots: number;
    amount: string;
    txHash?: string;
  }[];
};

type PoolInfo = {
  configured: boolean;
  autoPayout?: boolean;
  symbol: string;
  walletAddress: string | null;
  chainId?: number;
  tokenAddress?: string;
  payoutBps: number;
};

function shortAddr(a: string): string {
  if (!a) return "";
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
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
    const t = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const armed = Boolean(pool?.autoPayout);
  const configured = Boolean(pool?.configured);

  return (
    <section className="panel p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="chip">Auto Payout</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Automated on-chain payouts
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Every 3 minutes a hot-wallet worker computes the winners (holders
            whose allocated numbers match the winning ball) and sends each
            winner their share of the round&apos;s pool payout as an ERC-20
            transfer — no manual action required.
          </p>
        </div>
        <div
          className={`chip ${
            armed
              ? "border-emerald-400/40 text-emerald-300"
              : configured
                ? "border-amber-400/40 text-amber-300"
                : ""
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              armed
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                : configured
                  ? "bg-amber-400"
                  : "bg-white/40"
            }`}
          />
          {armed
            ? "armed · hot wallet loaded"
            : configured
              ? "read-only (no private key)"
              : "not configured"}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <SetupCard
          title="1. Fund the pool wallet"
          body="Send tokens to the address below. That balance is the live prize pool the front-end shows."
          value={
            pool?.walletAddress ? shortAddr(pool.walletAddress) : "not set"
          }
        />
        <SetupCard
          title="2. Configure Fly secrets"
          body="Set POOL_CHAIN_ID, POOL_RPC_URL, POOL_TOKEN_ADDRESS, POOL_WALLET_ADDRESS, POOL_WALLET_PRIVATE_KEY, POOL_TOKEN_SYMBOL, POOL_TOKEN_DECIMALS, POOL_PAYOUT_BPS (100 = 1%), POOL_USD_PRICE (optional), SETTLE_SECRET, POOL_HOLDERS."
          value={configured ? "configured" : "missing"}
        />
        <SetupCard
          title="3. Trigger every 3 min"
          body="POST /api/settle with header Authorization: Bearer $SETTLE_SECRET. Wire this to a Fly scheduled machine, GitHub Actions cron, or any cron-as-a-service."
          value="cron ready"
        />
      </div>

      <div className="mt-6 rounded-xl border border-[color:var(--panel-border)] bg-black/50 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
          Cron trigger (curl)
        </div>
        <pre className="mono mt-2 overflow-x-auto text-[11px] leading-relaxed text-white/70">
{`# Every 3 minutes, one line:
curl -sS -X POST https://superball-draw.fly.dev/api/settle \\
  -H "Authorization: Bearer $SETTLE_SECRET"`}
        </pre>
      </div>

      {settlements.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
            Recent auto-settlements
          </div>
          <div className="space-y-2">
            {settlements.slice(0, 5).map((s) => (
              <div
                key={s.round}
                className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="mono text-white/60">#{s.round}</span>
                    <span className="mono text-white/40">
                      {new Date(s.settledAt * 1000).toLocaleTimeString()}
                    </span>
                    <span className="chip">winning {s.winningNumber}</span>
                  </div>
                  <span className="mono text-[color:var(--gold-bright)]">
                    paid {s.paidTotal} wei to {s.payouts.length} wallets
                  </span>
                </div>
                {s.payouts.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs">
                    {s.payouts.map((p, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 text-white/70"
                      >
                        <span className="mono">{shortAddr(p.address)}</span>
                        <span className="mono text-white/50">
                          {p.winningSlots}/{p.slots} slots
                        </span>
                        <span className="mono text-[color:var(--gold-bright)]">
                          {p.amount} wei
                        </span>
                        {p.txHash && (
                          <a
                            href={`https://etherscan.io/tx/${p.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mono text-white/40 underline decoration-white/20 hover:text-[color:var(--gold-bright)]"
                          >
                            tx ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SetupCard({
  title,
  body,
  value,
}: {
  title: string;
  body: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-white/60">{body}</p>
      <div className="mono mt-3 break-all text-[11px] text-[color:var(--gold-bright)]">
        {value}
      </div>
    </div>
  );
}
