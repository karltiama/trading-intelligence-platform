import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { DEFAULT_SYNC_SYMBOLS } from '../src/modules/market-data/market-data.constants';

const MIN_BARS_FOR_SIGNALS = 200;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  type Row = {
    ticker: string;
    count: number;
    universeType: string | null;
    isActive: boolean | null;
    ok: boolean;
  };

  const results: Row[] = [];

  for (const ticker of DEFAULT_SYNC_SYMBOLS) {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true, universeType: true, isActive: true },
    });

    if (!symbol) {
      results.push({
        ticker,
        count: 0,
        universeType: null,
        isActive: null,
        ok: false,
      });
      continue;
    }

    const count = await prisma.dailyPrice.count({
      where: { symbolId: symbol.id },
    });

    results.push({
      ticker,
      count,
      universeType: symbol.universeType,
      isActive: symbol.isActive,
      ok: count >= MIN_BARS_FOR_SIGNALS,
    });
  }

  const failing = results.filter((row) => !row.ok);
  const passing = results.filter((row) => row.ok);

  console.log(`CORE daily readiness (minimum ${MIN_BARS_FOR_SIGNALS} bars)`);
  console.log(`PASS: ${passing.length} / ${results.length}`);
  console.log(`FAIL: ${failing.length}`);

  if (failing.length > 0) {
    console.log('\nBelow threshold (sorted by count):');
    for (const row of failing.sort((a, b) => a.count - b.count)) {
      const meta =
        row.universeType === null
          ? 'symbol missing'
          : `${row.universeType}, active=${row.isActive}`;
      console.log(`  ${row.ticker}: ${row.count} bars (${meta})`);
    }
    console.log(
      '\nRemediation: run POST /market-data/sync (or sync per symbol) with Alpaca credentials.',
    );
  }

  await prisma.$disconnect();
  await pool.end();
  process.exit(failing.length > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
