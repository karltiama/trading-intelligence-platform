# Trading Intelligence Platform

Monorepo for a backend-first trading intelligence project focused on architecture, dashboards, automation, and paper-trading workflows.

## Project status

Phase 0 foundation is complete:

- Next.js frontend app (`apps/web`)
- NestJS backend app (`apps/api`)
- Prisma integrated with Neon PostgreSQL
- Baseline API endpoints:
  - `GET /health`
  - `GET /symbols`
  - `GET /market-data/status`
  - `GET /signals`
- e2e tests for `/`, `/health`, `/symbols`

## Stack

- Frontend: Next.js
- Backend: NestJS
- Database: Neon PostgreSQL
- ORM: Prisma
- Testing: Jest + Supertest (e2e)

## Monorepo layout

```text
.
├── apps/
│   ├── api/     # NestJS backend + Prisma schema/migrations
│   └── web/     # Next.js frontend
├── notes/       # architecture notes + learning logs
└── .cursor/rules/  # project coding rules
```

## Prerequisites

- Node.js 22+
- npm 11+
- Neon project + `DATABASE_URL`

## Environment setup

Backend env lives in `apps/api/.env`.

Start from `apps/api/.env.example`:

```env
DATABASE_URL=
NODE_ENV=development
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
```

## Install

From repo root:

```bash
npm install
```

## Common commands (repo root)

```bash
# Run apps
npm run dev:api
npm run dev:web

# Backend quality
npm run lint:api
npm run test:api
npm run test:e2e:api
npm run build:api

# Database (Prisma via apps/api workspace)
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:studio
```

## API defaults

- API local URL: `http://localhost:3001`
- Web local URL: `http://localhost:3000`

Quick checks:

- `http://localhost:3001/health`
- `http://localhost:3001/symbols`

## Architecture notes

- Keep business logic in services.
- Keep persistence in Prisma-backed service/repository boundaries.
- Keep module boundaries explicit (`health`, `market-data`, `indicators`, `signals`, `scheduler`).
- Keep schema changes migration-driven and small.

## Phase 1 focus (Market Dashboard MVP)

1. Add `GET /market-data/candles` (Prisma read path)
2. Add market-data sync flow (manual trigger first)
3. Integrate frontend dashboard with `/symbols` + candles endpoint
