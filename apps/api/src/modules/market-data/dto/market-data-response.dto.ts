export type FormattedBar = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
};

export type FormattedQuote = {
  symbol: string;
  bid: number | null;
  ask: number | null;
  timestamp: string | null;
};
