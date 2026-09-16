# SuperBall — Provably Fair 1/50 Draw (every 3 minutes)

A luxury draw front-end powered by [**drand**](https://drand.love/) (the
League of Entropy public randomness beacon). Every winning combination is
derived deterministically from a threshold-signed randomness round, so anyone
can independently reproduce and verify the result.

## Why drand?

- **Public**: `https://api.drand.sh/public/<round>` returns a BLS threshold
  signature produced by a distributed network (Cloudflare, Protocol Labs,
  EPFL, Kudelski, and others).
- **Unpredictable**: future rounds cannot be computed by anyone until enough
  operators contribute their share.
- **Non-manipulable**: no single operator (including us) can bias a round.
- **Free and infrastructure-less**: no wallet, no on-chain fee — plain HTTPS.
- **Verifiable**: the signature can be checked against the group's public key
  in any language.

## Draw algorithm

1. Every 3 minutes (locked to a drand round that lands on a 180-second
   boundary from genesis; one every 6 drand rounds) fetch the beacon:
   `GET /public/<round>` → `{ signature }`.
2. `seed = SHA-256(signature)`.
3. Pick one uniform integer in `[1..50]` using rejection sampling on
   32-bit chunks of `SHA-256(seed || counter)` (no modulo bias).

The full logic lives in `src/lib/drand.ts` and is small enough to port to any
language for independent verification.

## Running locally

```bash
npm install
npm run dev -- --port 43111
```

Open http://127.0.0.1:43111.

## API

- `GET /api/beacon` — current drand round + countdown to the next one.
- `GET /api/draw` — latest round's derived draw.
- `GET /api/draw?round=<n>` — draw for a specific historical round.

## Prize pool + automatic on-chain payouts

The front-end shows a live ERC-20 prize pool. Every 3 minutes, a hot-wallet
worker (`POST /api/settle` protected by `SETTLE_SECRET`) settles the round:

1. Fetch the aligned drand round and derive the winning number.
2. Load holder list (`POOL_HOLDERS` env var or POST body).
3. Recompute each holder's per-slot allocation for this round.
4. Sum winning slots and split `POOL_PAYOUT_BPS / 10000` of the wallet's
   balance across winners proportionally to their winning slots.
5. Send ERC-20 `transfer` from the hot wallet to each winner.
6. Record the settlement (idempotent per round).

### Fly.io secrets (set with `fly secrets set KEY=value -a superball-draw`)

| Secret | Meaning |
|---|---|
| `POOL_CHAIN_ID` | EVM chain id (1 mainnet, 8453 base, 56 bsc, …) |
| `POOL_RPC_URL` | JSON-RPC endpoint (Alchemy/Infura/QuickNode/public) |
| `POOL_TOKEN_ADDRESS` | ERC-20 contract of the pool token |
| `POOL_WALLET_ADDRESS` | Hot wallet address (holds the pool) |
| `POOL_WALLET_PRIVATE_KEY` | Hot wallet key (`0x…`) — enables auto-payout |
| `POOL_TOKEN_SYMBOL` | e.g. `SUPER` (display only) |
| `POOL_TOKEN_DECIMALS` | e.g. `18` |
| `POOL_PAYOUT_BPS` | Basis points paid per round (100 = 1%) |
| `POOL_USD_PRICE` | Optional token price for USD display |
| `POOL_HOLDERS` | Holder snapshot: lines of `address,percent` |
| `SETTLE_SECRET` | Bearer token protecting `POST /api/settle` |

### Cron trigger (any cron-as-a-service works)

```bash
curl -sS -X POST https://superball-draw.fly.dev/api/settle \
  -H "Authorization: Bearer $SETTLE_SECRET"
```

Wire this to a Fly scheduled machine, GitHub Actions cron (`*/3 * * * *`), or
cron-job.org.

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript
- Tailwind CSS v4
