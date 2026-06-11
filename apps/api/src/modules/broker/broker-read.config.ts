export type BrokerReadProvider = 'alpaca' | 'disabled';

export function resolveBrokerReadProvider(
  raw = process.env.BROKER_READ_PROVIDER,
): BrokerReadProvider {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'alpaca') {
    return 'alpaca';
  }
  return 'disabled';
}
