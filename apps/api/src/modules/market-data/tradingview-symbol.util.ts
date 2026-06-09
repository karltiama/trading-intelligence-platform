const ALPACA_TO_TRADINGVIEW_EXCHANGE: Record<string, string> = {
  NYSE: 'NYSE',
  NASDAQ: 'NASDAQ',
  AMEX: 'AMEX',
  ARCA: 'ARCA',
  NYSEARCA: 'ARCA',
  BATS: 'BATS',
  OTC: 'OTC',
};

export function mapAlpacaExchangeToTradingView(exchange: string): string {
  const normalized = exchange.trim().toUpperCase();
  return ALPACA_TO_TRADINGVIEW_EXCHANGE[normalized] ?? normalized;
}

export function formatTradingViewSymbol(
  exchange: string,
  ticker: string,
): string {
  const tvExchange = mapAlpacaExchangeToTradingView(exchange);
  return `${tvExchange}:${ticker.trim().toUpperCase()}`;
}
