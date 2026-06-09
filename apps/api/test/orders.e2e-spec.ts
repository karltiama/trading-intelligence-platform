import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MarketDataService } from '../src/modules/market-data/market-data.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('OrdersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let marketDataService: MarketDataService;
  let ticker: string;
  const userEmail = 'orders-strict@local.test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    marketDataService = moduleFixture.get(MarketDataService);
    await app.init();
  });

  beforeEach(async () => {
    ticker = `ORD${Date.now()}`;
    const symbol = await prisma.symbol.create({
      data: { ticker, isActive: true },
      select: { id: true },
    });

    await prisma.dailyPrice.create({
      data: {
        symbolId: symbol.id,
        date: new Date('2026-04-25T00:00:00.000Z'),
        open: new Prisma.Decimal(100),
        high: new Prisma.Decimal(101),
        low: new Prisma.Decimal(99),
        close: new Prisma.Decimal(100),
        volume: new Prisma.Decimal(1000000),
        source: 'alpaca',
      },
    });
  });

  it('places market order and returns in orders list', async () => {
    const placed = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 2,
        stopLossPrice: 99,
        takeProfitPrice: 104,
        source: 'MANUAL',
      })
      .expect(201);

    expect(placed.body.symbol).toBe(ticker);
    expect(placed.body.status).toBe('FILLED');
    expect(placed.body.userEmail).toBe(userEmail);
    expect(placed.body.fillPrice).toBe(100);
    expect(placed.body.fillNotional).toBe(200);
    expect(placed.body.stopLossPrice).toBe(99);
    expect(placed.body.takeProfitPrice).toBe(104);
    expect(placed.body.riskPerShare).toBe(1);
    expect(placed.body.totalRisk).toBe(2);
    expect(placed.body.riskPercent).toBeGreaterThan(0);
    expect(placed.body.riskRewardRatio).toBe(4);
    expect(placed.body.source).toBe('MANUAL');

    const listed = await request(app.getHttpServer())
      .get('/orders')
      .set('x-user-email', userEmail)
      .expect(200);
    expect(Array.isArray(listed.body)).toBe(true);
    const row = listed.body.find((item: { orderId: string }) => {
      return item.orderId === placed.body.orderId;
    });
    expect(row).toBeDefined();
    expect(row?.userEmail).toBe(userEmail);
    expect(row?.source).toBe('MANUAL');
    expect(row?.fillPrice).toBe(100);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        eventType: 'ORDER_PLACED',
        userEmail,
        resourceId: placed.body.orderId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('updates stop and target on a filled BUY order', async () => {
    const placed = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        stopLossPrice: 99,
        takeProfitPrice: 104,
        source: 'MANUAL',
      })
      .expect(201);

    const orderId = placed.body.orderId as string;

    const updated = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/levels`)
      .set('x-user-email', userEmail)
      .send({
        stopLossPrice: 98,
        takeProfitPrice: 106,
      })
      .expect(200);

    expect(updated.body.orderId).toBe(orderId);
    expect(updated.body.stopLossPrice).toBe(98);
    expect(updated.body.takeProfitPrice).toBe(106);

    const listed = await request(app.getHttpServer())
      .get('/orders')
      .set('x-user-email', userEmail)
      .expect(200);
    const row = listed.body.find(
      (item: { orderId: string }) => item.orderId === orderId,
    );
    expect(row.stopLossPrice).toBe(98);
    expect(row.takeProfitPrice).toBe(106);
  });

  it('rejects cancel for immediately filled market order', async () => {
    const placed = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        stopLossPrice: 99,
        source: 'MANUAL',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${placed.body.orderId}/cancel`)
      .set('x-user-email', userEmail)
      .expect(409);
  });

  it('rejects requests without user context', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        source: 'MANUAL',
      })
      .expect(400);
  });

  it('rejects BUY without stop loss', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        source: 'MANUAL',
      })
      .expect(400);
  });

  it('rejects order with invalid quantity', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 0,
        source: 'MANUAL',
      })
      .expect(400);
  });

  it('rejects MANUAL order with signalId', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        source: 'MANUAL',
        signalId: 'fake-signal-id',
      })
      .expect(400);
  });

  it('rejects unknown manual ticker with 400', async () => {
    const unknownTicker = `NEW${Date.now()}`;
    const placed = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: unknownTicker,
        side: 'BUY',
        quantity: 1,
        source: 'MANUAL',
      })
      .expect(400);

    expect(String(placed.body.message)).toContain('not tracked');
  });

  it('blocks high-risk buy trade above max risk percent', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 5000,
        stopLossPrice: 99,
        source: 'MANUAL',
      })
      .expect(400);
  });

  it('rejects short sell when position is not held', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'SELL',
        quantity: 1,
        source: 'MANUAL',
      })
      .expect(409);
  });

  it('places SIGNAL order when signal matches symbol', async () => {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });
    if (!symbol) {
      throw new Error('Expected symbol row.');
    }
    const signal = await prisma.signal.create({
      data: {
        symbolId: symbol.id,
        strategyName: 'TREND_PULLBACK',
        status: 'ACTIVE',
        signalKey: `e2e-${Date.now()}`,
        signalDate: new Date('2026-04-25T00:00:00.000Z'),
        reason: 'e2e signal',
      },
      select: { id: true },
    });

    const placed = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        stopLossPrice: 99,
        source: 'SIGNAL',
        signalId: signal.id,
        note: 'from scanner',
      })
      .expect(201);

    expect(placed.body.source).toBe('SIGNAL');
    expect(placed.body.signalId).toBe(signal.id);
    expect(placed.body.note).toBe('from scanner');

    await prisma.signal.delete({ where: { id: signal.id } });
  });

  it('supports list filters and pagination for account-scoped order history', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        stopLossPrice: 99,
        source: 'MANUAL',
      })
      .expect(201);

    const bySymbol = await request(app.getHttpServer())
      .get(`/orders?symbol=${ticker}&status=FILLED&limit=1&offset=0`)
      .set('x-user-email', userEmail)
      .expect(200);

    expect(Array.isArray(bySymbol.body)).toBe(true);
    expect(bySymbol.body.length).toBeGreaterThan(0);
    expect(bySymbol.body[0].symbol).toBe(ticker);
    expect(bySymbol.body[0].status).toBe('FILLED');

    await request(app.getHttpServer())
      .get('/orders?limit=0')
      .set('x-user-email', userEmail)
      .expect(400);
  });

  it('supports explicit account selection and hides foreign accounts', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        stopLossPrice: 99,
        source: 'MANUAL',
      })
      .expect(201);

    const owner = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        paperAccounts: { select: { id: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!owner?.paperAccounts[0]) {
      throw new Error('Expected owner account to exist.');
    }

    await request(app.getHttpServer())
      .get(`/orders?accountId=${owner.paperAccounts[0].id}`)
      .set('x-user-email', userEmail)
      .expect(200);

    const foreignUser = await prisma.user.create({
      data: {
        email: `foreign-${Date.now()}@local.test`,
        displayName: 'Foreign',
      },
      select: { id: true },
    });
    const foreignAccount = await prisma.paperAccount.create({
      data: {
        userId: foreignUser.id,
        startingCash: new Prisma.Decimal(100000),
        cashBalance: new Prisma.Decimal(100000),
        currency: 'USD',
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .get(`/orders?accountId=${foreignAccount.id}`)
      .set('x-user-email', userEmail)
      .expect(404);

    await prisma.paperAccount.deleteMany({ where: { id: foreignAccount.id } });
    await prisma.user.deleteMany({ where: { id: foreignUser.id } });
  });

  it('supports cursor pagination without overlapping rows', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        stopLossPrice: 99,
        source: 'MANUAL',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
        stopLossPrice: 99,
        source: 'MANUAL',
      })
      .expect(201);

    const first = await request(app.getHttpServer())
      .get('/orders?limit=2')
      .set('x-user-email', userEmail)
      .expect(200);
    expect(Array.isArray(first.body)).toBe(true);
    expect(first.body.length).toBeGreaterThanOrEqual(2);

    const invalidCursor = await request(app.getHttpServer())
      .get('/orders?limit=1&cursor=bad-cursor')
      .set('x-user-email', userEmail)
      .expect(400);
    expect(String(invalidCursor.body.message)).toContain('invalid cursor');

    const cursor = Buffer.from(
      JSON.stringify({
        requestedAt: first.body[0].requestedAt,
        orderId: first.body[0].orderId,
      }),
      'utf8',
    ).toString('base64url');

    const paged = await request(app.getHttpServer())
      .get(`/orders?limit=5&cursor=${encodeURIComponent(cursor)}`)
      .set('x-user-email', userEmail)
      .expect(200);
    expect(Array.isArray(paged.body.items)).toBe(true);
    expect(
      paged.body.items.some(
        (row: { orderId: string }) => row.orderId === first.body[0].orderId,
      ),
    ).toBe(false);
  });

  afterEach(async () => {
    const symbol = await prisma.symbol.findUnique({
      where: { ticker },
      select: { id: true },
    });

    if (symbol) {
      await prisma.paperFill.deleteMany({ where: { symbolId: symbol.id } });
      await prisma.paperOrder.deleteMany({ where: { symbolId: symbol.id } });
      await prisma.paperPosition.deleteMany({ where: { symbolId: symbol.id } });
    }

    await prisma.dailyPrice.deleteMany({
      where: {
        symbol: { ticker },
      },
    });
    await prisma.symbol.deleteMany({ where: { ticker } });
  });

  afterAll(async () => {
    await app.close();
  });
});
