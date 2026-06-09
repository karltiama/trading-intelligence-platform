import {
  formatTradingViewSymbol,
  mapAlpacaExchangeToTradingView,
} from './tradingview-symbol.util';

describe('tradingview-symbol.util', () => {
  it('maps NYSE listings for TradingView embed', () => {
    expect(mapAlpacaExchangeToTradingView('NYSE')).toBe('NYSE');
    expect(formatTradingViewSymbol('NYSE', 'MCD')).toBe('NYSE:MCD');
  });

  it('maps NASDAQ listings', () => {
    expect(formatTradingViewSymbol('NASDAQ', 'aapl')).toBe('NASDAQ:AAPL');
  });

  it('maps NYSE Arca to ARCA', () => {
    expect(mapAlpacaExchangeToTradingView('NYSEARCA')).toBe('ARCA');
  });
});
