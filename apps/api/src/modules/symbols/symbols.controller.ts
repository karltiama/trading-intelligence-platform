import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SymbolsService } from './symbols.service';

type CreateSymbolBody = {
  ticker?: string;
  name?: string;
};

@Controller('symbols')
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  @Get()
  listSymbols() {
    return this.symbolsService.listSymbols();
  }

  @Post()
  addSymbol(@Body() body: CreateSymbolBody) {
    const ticker = body.ticker?.trim().toUpperCase();
    if (!ticker) {
      throw new BadRequestException('ticker is required.');
    }

    const name = body.name?.trim() || undefined;
    return this.symbolsService.addSymbol(ticker, name);
  }

  @Post('bootstrap-defaults')
  bootstrapDefaults() {
    return this.symbolsService.bootstrapDefaults();
  }

  @Patch(':ticker/toggle')
  toggleSymbol(@Param('ticker') tickerParam: string) {
    const ticker = tickerParam.trim().toUpperCase();
    if (!ticker) {
      throw new BadRequestException('ticker is required.');
    }
    return this.symbolsService.toggleSymbol(ticker);
  }
}
