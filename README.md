# Hundred Steps to Life

A 100-day course for becoming more grounded, capable, useful, and responsible — one meaningful step at a time.

> **Become better without becoming obsessed with being better.**

The course is designed so that self-improvement does not turn into perfectionism, performative productivity, or another form of avoidance. XP, streaks, and completion are engagement tools, not moral scorecards. The real standard is whether a lesson was understood, applied, and carried into life.

Islam is the foundation of the curriculum, which also draws carefully on psychology, learning science, philosophy, history, and work. See [`PROJECT_PHILOSOPHY.md`](PROJECT_PHILOSOPHY.md) for the full statement of intent and the sourcing rules that apply to all quotations.

## How a day works

Every lesson follows the same sequence:

> **Learn → understand → prove → apply → reflect → improve.**

A day cannot be completed by typing a reflection or pressing a button. The learner first passes a knowledge check, then records the real-world action they will take. Reflection helps carry the learning forward but is not treated as proof on its own.

## The island world

The 100 days are grouped into ten phases, each with its own island — a memory environment with one landmark, one emotional tone, and one recurring cue, all sharing a single route grammar so no new map has to be decoded.

| # | Island | Days | Learning area |
|---|---|---|---|
| 1 | Firstlight Cove | 1–10 | Foundation |
| 2 | Lantern Gardens | 11–20 | Mindset & Deen |
| 3 | Training Ridge | 21–30 | Discipline & Habits |
| 4 | The Observatory | 31–40 | Learning & Thinking |
| 5 | Bridgehaven | 41–50 | Character & Relationships |
| 6 | Wildwood Valley | 51–60 | Health & Energy |
| 7 | Maker's Quay | 61–70 | Skills & Creativity |
| 8 | Value Harbour | 71–80 | Money & Creating Value |
| 9 | Common Ground | 81–90 | Leadership & Responsibility |
| 10 | The Summit | 91–100 | Integration & Long-Term Life |

Completing an island extends the route across water and resolves a bridge or passage. At full completion the separate islands reveal themselves as one connected world, and the Summit beacon becomes the **Final Test** — an assessment of judgment and application across the whole course, not simple lesson recall.

The full design brief, including visual constraints and the shared interface language, is in [`ISLAND_WORLD.md`](ISLAND_WORLD.md).

## Local-first by design

An account is never required to take the course. All meaningful progress — lessons, quizzes, actions, reflections, XP, achievements, and streaks — is written to `localStorage` in the browser, and the app shell is cached by a service worker so it reopens offline after one online visit.

Signing in is purely additive: it enables an explicit backup of the local journal to the server and an explicit restore on another device. The server stores one JSON backup per user, capped at 150 KB, and never becomes the source of truth.

Three persistent appearance modes — Morning, Night, and Green — recolour the same world through an accessible theme selector.

## Tech stack

- **Client** — React 19, Vite 7, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), wouter, TanStack Query, framer-motion
- **Server** — Express 4, tRPC 11, Drizzle ORM on MySQL
- **Auth** — Manus OAuth with a `__Host-`-prefixed state cookie and a session cookie
- **Tests** — Vitest

## Project layout

```
client/          React SPA
  src/data/      the 100-day course content and its type definitions
  src/pages/     Home, ComponentShowcase, NotFound
  src/components/ Map, DashboardLayout, AIChatBox, ui/ (shadcn)
  public/        PWA manifest and service worker
server/          Express + tRPC API
  routers.ts     auth and progress procedures
  _core/         platform integration (OAuth, storage, LLM, vite middleware)
drizzle/         schema, relations and migrations
shared/          types and constants used by both sides
scripts/         island SVG and PWA icon generators
research/        sourcing notes for quotations and PWA verification
```

## Getting started

Requires **Node.js 22** and **pnpm 10**.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other scripts:

| Command | What it does |
|---|---|
| `pnpm dev` | Run the dev server with hot reload |
| `pnpm test` | Run the Vitest suite |
| `pnpm check` | Typecheck with `tsc --noEmit` |
| `pnpm build` | Build the client and bundle the server to `dist/` |
| `pnpm start` | Serve the production build |
| `pnpm format` | Format with Prettier |
| `pnpm db:push` | Generate and apply Drizzle migrations |

## Configuration

In the hosted Manus project these variables are platform-provided. Running anywhere else means supplying your own — copy [`.env.example`](.env.example) to `.env` and fill it in.

The course itself runs without any of them: they are needed only for sign-in, journal backup, and the optional platform integrations. Building without the analytics variables is fine and produces two harmless warnings.

## Licence

MIT
