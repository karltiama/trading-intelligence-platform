export type BrokerMarketOrderRequest = {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
};

export type BrokerOrderSubmission = {
  brokerOrderId: string;
  status: string;
  filledQty: number;
  filledAvgPrice: number | null;
};

export const BROKER_WRITE_PORT = Symbol('BROKER_WRITE_PORT');

export type BrokerWritePort = {
  submitMarketOrder(
    request: BrokerMarketOrderRequest,
  ): Promise<BrokerOrderSubmission>;
  cancelOrder(brokerOrderId: string): Promise<void>;
};
