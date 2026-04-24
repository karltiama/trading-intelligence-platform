import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

type SymbolResponse = {
  id: string;
  ticker: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/symbols (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/symbols')
      .expect(200);
    const symbols = response.body as SymbolResponse[];

    expect(Array.isArray(symbols)).toBe(true);

    if (symbols.length > 0) {
      const first = symbols[0];
      expect(typeof first.id).toBe('string');
      expect(typeof first.ticker).toBe('string');
      expect(typeof first.name).toBe('string');
      expect(typeof first.createdAt).toBe('string');
      expect(typeof first.updatedAt).toBe('string');
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
