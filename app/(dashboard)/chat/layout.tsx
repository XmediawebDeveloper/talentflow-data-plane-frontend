'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';

/**
 * Frame for /chat — Chat as its own page (it used to be a tab in the Teams
 * group, under /organization/team-chat, which now redirects here).
 *
 * Kept mounted across the page's own loading state, so the card and breadcrumb
 * stay put while the conversations load. The chat window fills the viewport
 * height and scrolls inside itself (its message list); on very short screens
 * (phone landscape) that would leave it ~0px tall, so there the frame grows to
 * its content and the page scrolls to a screen-tall chat window instead.
 */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const fill = 'flex flex-1 min-h-0 flex-col [@media(max-height:500px)]:flex-none';

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-x-clip bg-white xl:bg-slate-50 dark:bg-slate-900 xl:dark:bg-slate-950 [@media(max-height:500px)]:h-auto [@media(max-height:500px)]:flex-none">
      <div className={`mx-auto w-full max-w-[1400px] ${fill}`}>
        {/* Standard page panel: 16px inset on phones, 32px from md. */}
        <div className={`my-0 xl:my-5 w-full rounded-none xl:rounded-2xl bg-white shadow-none xl:shadow-2xl md:p-8 dark:bg-slate-900 p-4 ${fill}`}>
          <PageBreadcrumb
            className="mb-4 shrink-0 md:mb-6"
            items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Chat' }]}
          />
          {/* The chat window is the panel, edge to edge; the border frames it. */}
          <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900 ${fill}`}>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
