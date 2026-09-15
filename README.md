# SuperBall — Provably Fair 6/50 Draw

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

1. Fetch beacon: `GET /public/<round>` → `{ signature }`.
2. `seed = SHA-256(signature)`.
3. Fisher–Yates over `[1..50]` picking 6 numbers, using rejection sampling on
   32-bit chunks of `SHA-256(seed || counter)` to avoid modulo bias.
4. Sort ascending and display.

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
