import { MarketDataRepository } from '../market-data/market-data.repository';
import { SymbolsService } from './symbols.service';

describe('SymbolsService', () => {
  const marketDataRepository = {
    listTrackedSymbols: jest.fn(),
    createTrackedSymbol: jest.fn(),
    getTrackedSymbolByTicker: jest.fn(),
    seedDefaultSymbols: jest.fn(),
    toggleSymbolActive: jest.fn(),
  } as unknown as MarketDataRepository;

  const service = new SymbolsService(marketDataRepository);

  beforeEach(() => {
    jest.clearAllMocks();
    (marketDataRepository.getTrackedSymbolByTicker as jest.Mock).mockResolvedValue(
      null,
    );
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

  it('returns existing symbol and does not create duplicate', async () => {
    (marketDataRepository.getTrackedSymbolByTicker as jest.Mock).mockResolvedValue({
      id: 'sym-existing',
      ticker: 'AAPL',
      name: 'Apple Inc.',
      isActive: true,
      universeType: 'CORE',
      lastSeenAt: new Date('2026-04-28T00:00:00.000Z'),
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    });

    const result = await service.addSymbol('AAPL');

    expect(result.ticker).toBe('AAPL');
    expect(marketDataRepository.createTrackedSymbol).not.toHaveBeenCalled();
  });
});

