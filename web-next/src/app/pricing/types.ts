// ── Pricing Page Types ──────────────────────────────────────────────────────

export interface ModelPrice {
  model_name: string;
  quota_type: number;
  model_ratio: number;
  completion_ratio: number;
  enable_groups: string[];
  vendor_name?: string;
  vendor_icon?: string;
  vendor_description?: string;
  description?: string;
  tags?: string;
  supported_endpoint_types?: string[];
}

export interface Vendor {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

export interface SubscriptionPlan {
  id: number;
  title?: string;
  subtitle?: string;
  price_amount?: number;
  discount_price_amount?: number;
  discount_deadline?: number;
  has_active_discount?: boolean;
  effective_price_amount?: number;
  duration_unit?: string;
  duration_value?: number;
  custom_seconds?: number;
  resource_type?: string;
  amount_total?: number;
  total_amount?: number;
  request_count_total?: number;
  max_purchase_per_user?: number;
  sale_limit_count?: number;
  sold_count?: number;
  remaining_sale_count?: number;
  sold_out?: boolean;
  upgrade_group?: string;
  enabled?: boolean;
}

export interface PlanWrapper { plan: SubscriptionPlan }

export type ViewMode = 'card' | 'table';
export type QuotaTypeFilter = 'all' | 0 | 1;

export interface VendorChip {
  name: string;
  icon?: string;
  count: number;
  description?: string;
}
