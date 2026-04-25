import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { SymbolsController } from './symbols.controller';
import { SymbolsService } from './symbols.service';

@Module({
  imports: [MarketDataModule],
  controllers: [SymbolsController],
  providers: [SymbolsService],
})
export class SymbolsModule {}
