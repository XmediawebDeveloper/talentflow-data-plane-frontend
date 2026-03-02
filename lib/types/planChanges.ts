export interface PlanChangeDetail {
  field: string;
  label: string;
  old_value: string | number;
  new_value: string | number;
  impact: 'increase' | 'decrease' | 'removed' | 'added';
}

export interface PlanChangeSummary {
  price_change?: { old_price: number; new_price: number };
  quota_changes?: Array<{ quota_type: string; old_limit: number; new_limit: number }>;
  features_removed?: string[];
  features_added?: string[];
}

export interface PlanChangeNotification {
  id: string;
  tenant_id: string;
  change_type: 'price_increase' | 'quota_decrease' | 'feature_removal' | 'mixed';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  change_summary: PlanChangeSummary;
  deadline: string;
  days_remaining: number;
  created_at: string;
  notification_message?: string;
}

export interface PlanChangeAcceptResponse {
  status: 'accepted';
  new_price: number;
  new_billing_cycle_start: string;
  new_billing_cycle_end: string;
}

export interface PlanChangeRejectResponse {
  status: 'rejected';
  subscription_end_date: string;
}

export type PlanChangeUrgency = 'info' | 'warning' | 'critical';
