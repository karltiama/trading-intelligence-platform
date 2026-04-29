import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Signals scanner universe (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let coreTicker: string;
  let onDemandTicker: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    coreTicker = `CR${Date.now()}`;
    onDemandTicker = `OD${Date.now()}`;

    const coreSymbol = await prisma.symbol.create({
      data: {
        ticker: coreTicker,
        isActive: true,
        universeType: 'CORE',
      },
      select: { id: true },
    });
    const onDemandSymbol = await prisma.symbol.create({
      data: {
        ticker: onDemandTicker,
        isActive: true,
        universeType: 'ON_DEMAND',
      },
      select: { id: true },
    });

    const bars = buildValidDailyBars('2026-04-24');
    await prisma.dailyPrice.createMany({
      data: bars.map((bar) => ({
        symbolId: coreSymbol.id,
        date: bar.date,
        open: new Prisma.Decimal(bar.open),
        high: new Prisma.Decimal(bar.high),
        low: new Prisma.Decimal(bar.low),
        close: new Prisma.Decimal(bar.close),
        volume: new Prisma.Decimal(bar.volume),
        source: 'seed',
      })),
    });
    await prisma.dailyPrice.createMany({
      data: bars.map((bar) => ({
        symbolId: onDemandSymbol.id,
        date: bar.date,
        open: new Prisma.Decimal(bar.open),
        high: new Prisma.Decimal(bar.high),
        low: new Prisma.Decimal(bar.low),
        close: new Prisma.Decimal(bar.close),
        volume: new Prisma.Decimal(bar.volume),
        source: 'seed',
      })),
    });
  });

  it('does not scan ON_DEMAND symbols', async () => {
    const scanned = await request(app.getHttpServer())
      .post('/signals/scan')
      .expect(201);
    expect(scanned.body.scannedSymbols).toBeGreaterThanOrEqual(1);
    expect(
      scanned.body.scanned.some(
        (row: { symbol: string }) => row.symbol === coreTicker,
      ),
    ).toBe(true);
    expect(
      scanned.body.scanned.some(
        (row: { symbol: string }) => row.symbol === onDemandTicker,
      ),
    ).toBe(false);
    expect(scanned.body.summary).toEqual(
      expect.objectContaining({
        totalScanned: expect.any(Number),
        strongCount: expect.any(Number),
        watchlistCount: expect.any(Number),
        weakCount: expect.any(Number),
        ignoreCount: expect.any(Number),
      }),
    );
    expect(Array.isArray(scanned.body.matches)).toBe(true);
    expect(Array.isArray(scanned.body.watchlist)).toBe(true);
    expect(Array.isArray(scanned.body.scanned)).toBe(true);
    if (scanned.body.scanned.length > 0) {
      const first = scanned.body.scanned[0];
      expect(first).toEqual(
        expect.objectContaining({
          symbol: expect.any(String),
          grade: expect.any(String),
          tags: expect.any(Array),
          explanation: expect.any(String),
          reasons: expect.any(Array),
        }),
      );
      expect(first.totalScore).toBeUndefined();
      expect(first.components).toBeUndefined();
      expect(first.presentation).toBeUndefined();
    }

    const coreSignals = await prisma.signal.findMany({
      where: { symbol: { ticker: coreTicker } },
      select: { id: true },
    });
    const onDemandSignals = await prisma.signal.findMany({
      where: { symbol: { ticker: onDemandTicker } },
      select: { id: true },
    });

    expect(coreSignals.length).toBeGreaterThanOrEqual(1);
    expect(onDemandSignals.length).toBe(0);
  });

  afterEach(async () => {
    await prisma.signal.deleteMany({
      where: {
        symbol: { ticker: { in: [coreTicker, onDemandTicker] } },
      },
    });
    await prisma.dailyPrice.deleteMany({
      where: {
        symbol: { ticker: { in: [coreTicker, onDemandTicker] } },
      },
    });
    await prisma.symbol.deleteMany({
      where: { ticker: { in: [coreTicker, onDemandTicker] } },
    });
  });

  afterAll(async () => {
    await app.close();
  });
});

function buildValidDailyBars(latestDate: string): Array<{
  date: Date;
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
}> {
  const bars = Array.from({ length: 230 }, (_, index) => {
    const date = new Date('2025-06-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + index);
    const close = 100 + index * 0.2;
    const open = close * 0.995;
    return {
      date,
      open,
      close,
      low: close * 0.99,
      high: close * 1.01,
      volume: 1_000_000,
    };
  });
  const base = bars[209].close;
  for (let index = 210; index < 230; index += 1) {
    bars[index].close = base * (1 + ((index - 210) % 3) * 0.001);
    bars[index].open = bars[index].close * 0.995;
    bars[index].low = bars[index].close * 0.99;
    bars[index].high = bars[index].close * 1.01;
  }
  bars[bars.length - 1].date = new Date(`${latestDate}T00:00:00.000Z`);
  bars[bars.length - 1].close = bars[bars.length - 2].close * 1.001;
  bars[bars.length - 1].open = bars[bars.length - 1].close * 0.995;
  bars[bars.length - 1].low = bars[bars.length - 1].close * 0.99;
  bars[bars.length - 1].high = bars[bars.length - 1].close * 1.01;
  bars[bars.length - 1].volume = 950_000;
  return bars;
}
