import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UniverseType } from '@prisma/client';
import { SymbolsService } from './symbols.service';

type CreateSymbolBody = {
  ticker?: string;
  name?: string;
  universeType?: string;
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
    const universeTypeRaw = body.universeType?.trim().toUpperCase();
    let universeType: UniverseType | undefined;
    if (universeTypeRaw) {
      if (
        universeTypeRaw !== UniverseType.CORE &&
        universeTypeRaw !== UniverseType.ON_DEMAND
      ) {
        throw new BadRequestException(
          'universeType must be CORE or ON_DEMAND.',
        );
      }
      universeType = universeTypeRaw as UniverseType;
    }
    return this.symbolsService.addSymbol(ticker, name, universeType);
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
