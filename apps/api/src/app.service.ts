import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  listSymbols() {
    return this.prisma.symbol.findMany({
      orderBy: { ticker: 'asc' },
      select: {
        id: true,
        ticker: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
