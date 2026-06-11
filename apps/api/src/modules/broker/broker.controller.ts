import { Controller, Get } from '@nestjs/common';
import { BrokerReadService } from './broker-read.service';

@Controller('broker')
export class BrokerController {
  constructor(private readonly brokerReadService: BrokerReadService) {}

  @Get('snapshot')
  getSnapshot() {
    return this.brokerReadService.getSnapshot();
  }

  @Get('health')
  getHealth() {
    return this.brokerReadService.getHealth();
  }
}
