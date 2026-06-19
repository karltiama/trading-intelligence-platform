import { Module } from '@nestjs/common';
import { AlpacaBrokerReadAdapter } from './adapters/alpaca-broker-read.adapter';
import { AlpacaBrokerWriteAdapter } from './adapters/alpaca-broker-write.adapter';
import { BrokerController } from './broker.controller';
import { BrokerReadService } from './broker-read.service';
import { BrokerWriteService } from './broker-write.service';

@Module({
  controllers: [BrokerController],
  providers: [
    AlpacaBrokerReadAdapter,
    AlpacaBrokerWriteAdapter,
    BrokerReadService,
    BrokerWriteService,
  ],
  exports: [BrokerReadService, BrokerWriteService],
})
export class BrokerModule {}
