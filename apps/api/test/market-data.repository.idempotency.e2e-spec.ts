import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { MarketDataRepository } from '../src/modules/market-data/market-data.repository';
import { PrismaService } from '../src/prisma/prisma.service';

describe('MarketDataRepository idempotency (integration)', () => {
  let moduleRef: TestingModule;
  let repository: MarketDataRepository;
  let prisma: PrismaService;
  let symbolId: string | null = null;
  let ticker: string | null = null;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, MarketDataRepository],
    }).compile();

    repository = moduleRef.get(MarketDataRepository);
    prisma = moduleRef.get(PrismaService);
  });

  it('does not create duplicate DailyPrice rows for repeated upserts', async () => {
    ticker = `IDEMP_${Date.now()}`;
    const created = await repository.findOrCreateSymbolByTicker(ticker);
    symbolId = created.id;

    const rows = [
      {
        date: new Date('2026-04-23T00:00:00.000Z'),
        open: new Prisma.Decimal('100.00'),
        high: new Prisma.Decimal('110.00'),
        low: new Prisma.Decimal('95.00'),
        close: new Prisma.Decimal('105.00'),
        volume: new Prisma.Decimal('1000.00'),
        source: 'alpaca',
      },
      {
        date: new Date('2026-04-24T00:00:00.000Z'),
        open: new Prisma.Decimal('106.00'),
        high: new Prisma.Decimal('112.00'),
        low: new Prisma.Decimal('101.00'),
        close: new Prisma.Decimal('108.00'),
        volume: new Prisma.Decimal('900.00'),
        source: 'alpaca',
      },
    ];

    await repository.upsertDailyBars(symbolId, rows);
    await repository.upsertDailyBars(symbolId, rows);

    const dailyPrices = await prisma.dailyPrice.findMany({
      where: { symbolId },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        open: true,
        close: true,
      },
    });

    expect(dailyPrices).toHaveLength(2);
    expect(dailyPrices[0].date.toISOString()).toBe('2026-04-23T00:00:00.000Z');
    expect(dailyPrices[1].date.toISOString()).toBe('2026-04-24T00:00:00.000Z');
    expect(dailyPrices[0].open.toString()).toBe('100');
    expect(dailyPrices[1].close.toString()).toBe('108');
  });

  afterEach(async () => {
    if (symbolId) {
      await prisma.dailyPrice.deleteMany({ where: { symbolId } });
    }

    if (ticker) {
      await prisma.symbol.deleteMany({ where: { ticker } });
    }

    await moduleRef.close();
  });
});
