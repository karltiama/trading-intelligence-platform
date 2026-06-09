import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MarketDataService } from '../src/modules/market-data/market-data.service';

const ticker = process.argv[2]?.trim().toUpperCase() ?? 'SPY';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const marketDataService = app.get(MarketDataService);
    const barsUpserted = await marketDataService.syncHourlyBarsForSymbol(ticker);
    const bars = await marketDataService.getHourlyBars(ticker, 5);
    console.log(
      JSON.stringify({ ticker, barsUpserted, sampleBars: bars.length }, null, 2),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
