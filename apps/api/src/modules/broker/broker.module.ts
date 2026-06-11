import { Module } from '@nestjs/common';
import { AlpacaBrokerReadAdapter } from './adapters/alpaca-broker-read.adapter';
import { BrokerController } from './broker.controller';
import { BrokerReadService } from './broker-read.service';

@Module({
  controllers: [BrokerController],
  providers: [AlpacaBrokerReadAdapter, BrokerReadService],
  exports: [BrokerReadService],
})
export class BrokerModule {}
