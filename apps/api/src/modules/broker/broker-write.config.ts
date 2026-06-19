export type BrokerWriteProvider = 'alpaca' | 'disabled';

export function resolveBrokerWriteProvider(
  raw = process.env.BROKER_WRITE_PROVIDER,
): BrokerWriteProvider {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'alpaca') {
    return 'alpaca';
  }
  return 'disabled';
}
