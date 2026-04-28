import { MarketDataRepository } from '../market-data/market-data.repository';
import { SymbolsService } from './symbols.service';

describe('SymbolsService', () => {
  const marketDataRepository = {
    listTrackedSymbols: jest.fn(),
    createTrackedSymbol: jest.fn(),
    seedDefaultSymbols: jest.fn(),
    toggleSymbolActive: jest.fn(),
  } as unknown as MarketDataRepository;

  const service = new SymbolsService(marketDataRepository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults new symbols to ON_DEMAND universe', async () => {
    (marketDataRepository.createTrackedSymbol as jest.Mock).mockResolvedValue({
      id: 'sym-1',
      ticker: 'AMD',
      name: null,
      isActive: true,
      universeType: 'ON_DEMAND',
      lastSeenAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.addSymbol('AMD');

    expect(marketDataRepository.createTrackedSymbol).toHaveBeenCalledWith(
      'AMD',
      undefined,
      'ON_DEMAND',
    );
  });
});

