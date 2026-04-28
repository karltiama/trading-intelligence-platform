import { MarketDataRepository } from '../market-data/market-data.repository';
import { MarketDataService } from '../market-data/market-data.service';
import { PaperTradingService } from '../paper-trading/paper-trading.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const paperTradingService = {
    placeMarketOrder: jest.fn(),
    listOrders: jest.fn(),
    listOrdersPage: jest.fn(),
    cancelOrder: jest.fn(),
  } as unknown as PaperTradingService;

  const marketDataService = {
    getBars: jest.fn(),
    syncDailyBars: jest.fn(),
  } as unknown as MarketDataService;

  const marketDataRepository = {
    findSymbolByTicker: jest.fn(),
    createTrackedSymbol: jest.fn(),
    touchSymbolLastSeenAt: jest.fn(),
  } as unknown as MarketDataRepository;

  const service = new OrdersService(
    paperTradingService,
    marketDataService,
    marketDataRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (paperTradingService.placeMarketOrder as jest.Mock).mockResolvedValue({
      orderId: 'ord-1',
      status: 'FILLED',
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 1,
      fillPrice: 100,
      fillNotional: 100,
      cashBalance: 99900,
      signalId: null,
      source: 'MANUAL',
      note: null,
    });
    (marketDataService.getBars as jest.Mock).mockResolvedValue([]);
    (marketDataService.syncDailyBars as jest.Mock).mockResolvedValue(1);
    (marketDataRepository.touchSymbolLastSeenAt as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  it('creates ON_DEMAND symbol for unknown manual order then updates lastSeenAt', async () => {
    (marketDataRepository.findSymbolByTicker as jest.Mock).mockResolvedValue(null);
    (marketDataRepository.createTrackedSymbol as jest.Mock).mockResolvedValue({
      id: 'sym-1',
      ticker: 'AAPL',
    });

    await service.placeOrder(
      {
        symbol: 'aapl',
        side: 'BUY',
        quantity: 1,
        source: 'MANUAL',
      },
      'orders-test@local.test',
    );

    expect(marketDataRepository.createTrackedSymbol).toHaveBeenCalledWith(
      'AAPL',
      undefined,
      'ON_DEMAND',
    );
    expect(marketDataService.syncDailyBars).toHaveBeenCalledWith('AAPL', 30);
    expect(marketDataRepository.touchSymbolLastSeenAt).toHaveBeenCalledWith('AAPL');
  });
});

