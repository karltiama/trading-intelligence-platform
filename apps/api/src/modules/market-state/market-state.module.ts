import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MarketStateController } from './market-state.controller';
import { MarketStateService } from './market-state.service';

@Module({
  imports: [PrismaModule],
  controllers: [MarketStateController],
  providers: [MarketStateService],
})
export class MarketStateModule {}
