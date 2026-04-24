# Trading Intelligence Platform API

NestJS backend for the Trading Intelligence Platform monorepo.

## Phase 0 status

- Core modules: `health`, `market-data`, `indicators`, `signals`, `scheduler`
- Prisma integrated with Neon Postgres
- Baseline endpoints:
  - `GET /health`
  - `GET /symbols`
  - `GET /market-data/status`
  - `GET /signals`
- e2e tests cover `/`, `/health`, and `/symbols`

## Prerequisites

- Node 22+
- npm 11+
- Neon Postgres database

## Environment

Copy `.env.example` to `.env` and set real values:

```bash
DATABASE_URL=
NODE_ENV=development
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
```

## Install and run

From repo root:

```bash
npm install
npm run dev:api
```

Or from `apps/api`:

```bash
npm install
npm run start:dev
```

API default port is `3001`.

## Database workflow (Prisma)

From `apps/api`:

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:init
npm run prisma:studio
```

## Testing and quality

From `apps/api`:

```bash
npm run test
npm run test:e2e
npm run lint
npm run build
```

## Notes

- Canonical module naming is kebab-case (e.g. `market-data`).
- Keep business logic in services and persistence in Prisma-backed service/repository layers as Phase 1 grows.
