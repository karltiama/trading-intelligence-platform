import type { BrokerPosition } from './broker-position.dto';

export type BrokerProvider = 'alpaca' | 'internal';
export type BrokerSnapshotStatus = 'ok' | 'disabled' | 'error';

export type BrokerAccountSnapshot = {
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  lastEquity: number;
  dayChange: number;
  dayChangePercent: number;
  currency: 'USD';
};

export type BrokerSnapshot = {
  provider: BrokerProvider;
  status: BrokerSnapshotStatus;
  asOf: string;
  account: BrokerAccountSnapshot;
  positions: BrokerPosition[];
  message?: string;
};

export type BrokerHealth = {
  provider: BrokerProvider | 'disabled';
  status: 'ok' | 'disabled' | 'error';
  asOf: string;
  message?: string;
};
