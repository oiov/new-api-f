export const REFUND_TARGET_BALANCE = 'balance';
export const REFUND_TARGET_ORIGINAL_PAYMENT = 'original_payment';

export const getDefaultSubscriptionRefundSettings = () => ({
  page_enabled: false,
  enabled: true,
  allow_balance_refund: true,
  allow_original_payment_refund: true,
  settlement_mode: 'duration_ratio',
  currency: 'USD',
  codex_input_price_per_million: 0,
  codex_output_price_per_million: 0,
  codex_cache_read_price_per_million: 0,
  codex_cache_write_price_per_million: 0,
  notes: '',
});

export const parseSubscriptionRefundSettings = (raw) => {
  const defaults = getDefaultSubscriptionRefundSettings();
  if (!raw) return defaults;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      ...defaults,
      ...(parsed || {}),
    };
  } catch {
    return defaults;
  }
};

export const getAllowedRefundTargets = (settings) => {
  const targets = [];
  if (settings?.allow_balance_refund) {
    targets.push(REFUND_TARGET_BALANCE);
  }
  if (settings?.allow_original_payment_refund) {
    targets.push(REFUND_TARGET_ORIGINAL_PAYMENT);
  }
  return targets;
};

export const getDefaultRefundTarget = (settings) => {
  const targets = getAllowedRefundTargets(settings);
  return targets[0] || '';
};
