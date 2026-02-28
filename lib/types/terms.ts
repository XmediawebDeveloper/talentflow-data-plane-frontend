/**
 * Terms & Conditions Types
 */

export interface TermsAndConditions {
  id: string;
  version: string;
  title: string;
  content_html: string;
  content_plain: string;
  published_at: string;
  effective_date: string;
}

export interface TermsAcceptanceStatus {
  tenant_id: string;
  current_terms_id: string | null;
  current_terms_version: string | null;
  has_accepted_current: boolean;
  acceptance_record: Record<string, any> | null;
  grace_period_end: string | null;
  days_remaining: number | null;
}

export interface TermsAcceptanceRecord {
  id: string;
  tenant_id: string;
  terms_id: string;
  terms_version: string;
  terms_title: string;
  accepted_at: string;
  accepted_by: string;
  accepted_by_email: string;
}

export type TermsUrgency = 'info' | 'warning' | 'critical';
