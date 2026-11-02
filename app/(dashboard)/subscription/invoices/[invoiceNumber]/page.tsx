'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/services/api';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks/useAuth';
import { billToFromAuth, generateBillingInvoicePDF } from '@/lib/utils/pdfInvoice';
import InvoiceDetailView from '@/components/subscription/InvoiceDetailView';
import { BILLING_HISTORY_URL, normalizeBillingInvoice, type BillingInvoice } from '@/lib/utils/billingInvoices';

/**
 * One billing invoice as its own page (was a popup on Billing History) —
 * /subscription/invoices/<invoice number>, laid out like the admin console's
 * invoice view. The billing API has no single-invoice endpoint, so the list is
 * read and this invoice picked from it — the same data the list shows.
 */
export default function InvoicePage() {
  const params = useParams<{ invoiceNumber: string }>();
  const invoiceNumber = decodeURIComponent(String(params?.invoiceNumber ?? ''));
  const { user, tenant } = useAuth();

  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const [downloading, setDownloading] = useState(false);

  // Bumped by Retry to load again. Status starts 'loading'; Retry resets it.
  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    api.get('/billing/invoices/billing')
      .then((res) => {
        if (cancelled) return;
        const invoices = ((res.data?.data?.invoices || []) as BillingInvoice[]).map(normalizeBillingInvoice);
        const match = invoices.find((inv) => inv.invoice_number === invoiceNumber) ?? null;
        setInvoice(match);
        setStatus(match ? 'ready' : 'not-found');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[InvoicePage] Failed to load invoice:', err);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [invoiceNumber, reloadKey]);

  const handleDownload = async (inv: BillingInvoice) => {
    setDownloading(true);
    try {
      await generateBillingInvoicePDF(inv, billToFromAuth(user, tenant));
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="my-4 w-full rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900 md:my-5 md:p-8">
          <PageBreadcrumb
            className="mb-4 md:mb-6"
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Current Plan', href: '/subscription/current-plan' },
              { label: 'Billing History', href: BILLING_HISTORY_URL },
              { label: invoiceNumber || 'Invoice' },
            ]}
          />

          {status === 'loading' ? (
            <div className="space-y-6" aria-busy="true" aria-label="Loading invoice">
              <Skeleton className="h-4 w-40" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-72" />
                <Skeleton className="h-4 w-96 max-w-full" />
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <Skeleton className="h-[520px] w-full rounded-xl" />
                <div className="space-y-4">
                  <Skeleton className="h-36 w-full rounded-xl" />
                  <Skeleton className="h-56 w-full rounded-xl" />
                </div>
              </div>
            </div>
          ) : status === 'ready' && invoice ? (
            <InvoiceDetailView invoice={invoice} downloading={downloading} onDownload={handleDownload} />
          ) : (
            <div className="space-y-4">
              <Link
                href={BILLING_HISTORY_URL}
                className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Billing History
              </Link>
              <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 p-8 text-center dark:border-slate-700 sm:p-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive-subtle">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">
                    {status === 'not-found' ? 'Invoice not found' : 'Couldn’t load this invoice'}
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    {status === 'not-found'
                      ? `There’s no invoice ${invoiceNumber} on this account — the link may be wrong.`
                      : 'Something went wrong while loading it. Please try again.'}
                  </p>
                </div>
                {status === 'error' && (
                  <Button variant="secondary" size="sm" onClick={retry} icon={<RotateCcw className="h-4 w-4" />}>
                    Retry
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
