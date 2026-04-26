import { Module } from '@nestjs/common';
import { AccountContextService } from './account-context.service';

@Module({
  providers: [AccountContextService],
  exports: [AccountContextService],
})
export class AccountContextModule {}
