import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('OrdersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ticker: string;
  const userEmail = 'orders-strict@local.test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
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
      })
      .expect(201);

    expect(placed.body.symbol).toBe(ticker);
    expect(placed.body.status).toBe('FILLED');
    expect(placed.body.userEmail).toBe(userEmail);
    expect(placed.body.fillPrice).toBe(100);
    expect(placed.body.fillNotional).toBe(200);

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
  });

  it('rejects cancel for immediately filled market order', async () => {
    const placed = await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
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
      })
      .expect(400);
  });

  it('rejects unknown symbol order', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: 'UNKNOWN_TICKER',
        side: 'BUY',
        quantity: 1,
      })
      .expect(404);
  });

  it('rejects insufficient cash on large buy', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 10_000_000,
      })
      .expect(409);
  });

  it('rejects short sell when position is not held', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'SELL',
        quantity: 1,
      })
      .expect(409);
  });

  it('supports list filters and pagination for account-scoped order history', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('x-user-email', userEmail)
      .send({
        symbol: ticker,
        side: 'BUY',
        quantity: 1,
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
