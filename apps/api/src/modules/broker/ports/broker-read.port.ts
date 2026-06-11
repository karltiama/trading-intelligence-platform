import type { BrokerAccountSnapshot } from '../dto/broker-snapshot.dto';
import type { BrokerPosition } from '../dto/broker-position.dto';

export const BROKER_READ_PORT = Symbol('BROKER_READ_PORT');

export type BrokerReadPort = {
  getAccountSnapshot(): Promise<BrokerAccountSnapshot>;
  listOpenPositions(): Promise<BrokerPosition[]>;
};
