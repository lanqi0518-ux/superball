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

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript
- Tailwind CSS v4
