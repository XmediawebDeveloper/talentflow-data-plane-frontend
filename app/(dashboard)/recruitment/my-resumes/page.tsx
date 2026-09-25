import { redirect } from 'next/navigation';

/**
 * My Resumes is now the first tab of Resume Database, not a route of its own.
 *
 * This redirect stays because the old path is in bookmarks, in notification
 * deep links (`?resume_id=` / `?batch_id=`) and in e2e specs. Redirecting on
 * the server keeps those working with no flash of an empty client page, and
 * every existing query parameter is carried across untouched — only `tab` is
 * added, so the user lands on the pool the link meant.
 */
export default async function MyResumesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === 'tab') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.append(key, value);
  }
  params.set('tab', 'my-resumes');
  redirect(`/recruitment/resume-database?${params.toString()}`);
}
