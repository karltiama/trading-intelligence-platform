import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AutomationController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ticker: string;
  const userEmail = 'automation-strict@local.test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    ticker = `AUT${Date.now()}`;
    const symbol = await prisma.symbol.create({
      data: { ticker, isActive: true },
      select: { id: true },
    });

    await prisma.dailyPrice.create({
      data: {
        symbolId: symbol.id,
        date: new Date('2026-04-25T00:00:00.000Z'),
        open: new Prisma.Decimal(100),
        high: new Prisma.Decimal(100),
        low: new Prisma.Decimal(100),
        close: new Prisma.Decimal(100),
        volume: new Prisma.Decimal(1000000),
        source: 'alpaca',
      },
    });
  });

  it('triggers run and exposes run details and signal executions', async () => {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });
    if (!symbol) {
      throw new Error('Expected seeded symbol.');
    }

    const signalAt = '2026-04-25T12:00:00.000Z';
    const triggered = await request(app.getHttpServer())
      .post('/automation/runs')
      .set('x-user-email', userEmail)
      .send({
        strategy: 'mean-reversion',
        signals: [
          {
            symbolId: symbol.id,
            symbol: ticker,
            side: 'BUY',
            signalAt,
            quantity: 1,
          },
          {
            symbolId: symbol.id,
            symbol: ticker,
            side: 'BUY',
            signalAt,
            quantity: 1,
          },
        ],
      })
      .expect(201);

    expect(triggered.body.strategy).toBe('mean-reversion');
    expect(triggered.body.userEmail).toBe(userEmail);
    expect(triggered.body.totalSignals).toBe(2);
    expect(triggered.body.placed).toBe(1);
    expect(triggered.body.duplicateSkipped).toBe(1);
    expect(triggered.body.rejectedRisk).toBe(0);
    expect(triggered.body.failed).toBe(0);

    const runId = triggered.body.runId as string;

    const list = await request(app.getHttpServer())
      .get('/automation/runs?limit=5')
      .set('x-user-email', userEmail)
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(
      list.body.some((row: { runId: string }) => row.runId === runId),
    ).toBe(true);
    const listRow = list.body.find((row: { runId: string }) => row.runId === runId);
    expect(listRow?.userEmail).toBe(userEmail);

    const details = await request(app.getHttpServer())
      .get(`/automation/runs/${runId}`)
      .set('x-user-email', userEmail)
      .expect(200);
    expect(details.body.runId).toBe(runId);
    expect(details.body.userEmail).toBe(userEmail);
    expect(details.body.summary.totalSignals).toBe(1);
    expect(details.body.summary.placed).toBe(1);
    expect(details.body.summary.duplicateSkipped).toBe(0);

    const signals = await request(app.getHttpServer())
      .get(`/automation/runs/${runId}/signals`)
      .set('x-user-email', userEmail)
      .expect(200);
    expect(Array.isArray(signals.body)).toBe(true);
    expect(signals.body).toHaveLength(1);
    expect(signals.body[0].userEmail).toBe(userEmail);
    expect(signals.body[0].symbol).toBe(ticker);
    expect(signals.body[0].status).toBe('PLACED');

    const placedOrderCount = await prisma.paperOrder.count({
      where: { symbolId: symbol.id },
    });
    expect(placedOrderCount).toBe(1);
  });

  it('records risk-rejected signal without placing order', async () => {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });
    if (!symbol) {
      throw new Error('Expected seeded symbol.');
    }

    const triggered = await request(app.getHttpServer())
      .post('/automation/runs')
      .set('x-user-email', userEmail)
      .send({
        strategy: 'risk-guardrail',
        signals: [
          {
            symbolId: symbol.id,
            symbol: ticker,
            side: 'BUY',
            signalAt: '2026-04-25T12:30:00.000Z',
            quantity: 5000,
          },
        ],
      })
      .expect(201);

    expect(triggered.body.placed).toBe(0);
    expect(triggered.body.userEmail).toBe(userEmail);
    expect(triggered.body.duplicateSkipped).toBe(0);
    expect(triggered.body.rejectedRisk).toBe(1);
    expect(triggered.body.failed).toBe(0);
    expect(triggered.body.status).toBe('SUCCESS');

    const runId = triggered.body.runId as string;
    const details = await request(app.getHttpServer())
      .get(`/automation/runs/${runId}`)
      .set('x-user-email', userEmail)
      .expect(200);
    expect(details.body.summary.totalSignals).toBe(1);
    expect(details.body.userEmail).toBe(userEmail);
    expect(details.body.summary.placed).toBe(0);
    expect(details.body.summary.rejectedRisk).toBe(1);
    expect(details.body.summary.failed).toBe(0);

    const signals = await request(app.getHttpServer())
      .get(`/automation/runs/${runId}/signals`)
      .set('x-user-email', userEmail)
      .expect(200);
    expect(signals.body).toHaveLength(1);
    expect(signals.body[0].userEmail).toBe(userEmail);
    expect(signals.body[0].status).toBe('REJECTED_RISK');
    expect(signals.body[0].orderId).toBeNull();
    expect(String(signals.body[0].reason)).toContain('quantity exceeds');

    const placedOrderCount = await prisma.paperOrder.count({
      where: { symbolId: symbol.id },
    });
    expect(placedOrderCount).toBe(0);
  });

  it('supports run list filters/pagination and ownership-safe not found', async () => {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });
    if (!symbol) {
      throw new Error('Expected seeded symbol.');
    }

    const triggered = await request(app.getHttpServer())
      .post('/automation/runs')
      .set('x-user-email', userEmail)
      .send({
        strategy: 'filterable-strategy',
        signals: [
          {
            symbolId: symbol.id,
            symbol: ticker,
            side: 'BUY',
            signalAt: '2026-04-25T14:00:00.000Z',
            quantity: 1,
          },
        ],
      })
      .expect(201);

    const runId = triggered.body.runId as string;

    const filtered = await request(app.getHttpServer())
      .get('/automation/runs?strategy=filterable-strategy&status=SUCCESS&limit=1&offset=0')
      .set('x-user-email', userEmail)
      .expect(200);
    expect(Array.isArray(filtered.body)).toBe(true);
    expect(filtered.body.some((row: { runId: string }) => row.runId === runId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .get('/automation/runs?offset=-1')
      .set('x-user-email', userEmail)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/automation/runs/${runId}`)
      .set('x-user-email', 'another-user@local.test')
      .expect(404);
  });

  it('rejects automation run trigger without user context', async () => {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });
    if (!symbol) {
      throw new Error('Expected seeded symbol.');
    }

    await request(app.getHttpServer())
      .post('/automation/runs')
      .send({
        strategy: 'strict-missing-context',
        signals: [
          {
            symbolId: symbol.id,
            symbol: ticker,
            side: 'BUY',
            signalAt: '2026-04-25T12:30:00.000Z',
            quantity: 1,
          },
        ],
      })
      .expect(400);
  });

  afterEach(async () => {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });

    if (symbol) {
      await prisma.automationSignalExecution.deleteMany({
        where: { symbolId: symbol.id },
      });
      await prisma.paperFill.deleteMany({ where: { symbolId: symbol.id } });
      await prisma.paperOrder.deleteMany({ where: { symbolId: symbol.id } });
      await prisma.paperPosition.deleteMany({ where: { symbolId: symbol.id } });
    }

    await prisma.strategyRun.deleteMany({
      where: {
        strategy: {
          in: ['mean-reversion', 'risk-guardrail', 'filterable-strategy'],
        },
      },
    });
    await prisma.dailyPrice.deleteMany({
      where: { symbol: { ticker } },
    });
    await prisma.symbol.deleteMany({ where: { ticker } });
  });

  afterAll(async () => {
    await app.close();
  });
});
