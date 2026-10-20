import { aiInterviewService, type AIInterviewResponse } from '@/lib/services/aiInterviewService';

/**
 * Where a DRAFT AI interview resumes editing.
 *
 * Nothing on the config records which wizard step the recruiter reached, but
 * the Clusters step leaves a mark: a skill round's `topics` hold the CLUSTER
 * names (Configure builds them from the generated clusters — see
 * AIInterviewConfig's rounds builder), so a draft whose must-have /
 * nice-to-have round has topics got past Configure and reopens on Clusters.
 * Otherwise it reopens on Configure. The HR round is ignored: its topics are a
 * fixed list set at Configure time, not clusters.
 *
 * Newer saves also stamp `wizard_step` into `special_instructions`, which takes
 * precedence over that heuristic.
 *
 * Preview & Publish saves nothing of its own, so a draft left there reopens on
 * Clusters — one click ("Continue to Preview") short of where it was.
 */
const CONFIG_BASE = '/recruitment/ai-interviews/jd-selection/ai-interview-config';
const SKILL_ROUNDS = new Set(['must_have_skills', 'nice_to_have_skills']);

type ResumeSource = Pick<AIInterviewResponse, 'id' | 'jd_id' | 'rounds_config' | 'special_instructions'>;

export function aiInterviewDraftHasClusters(config: Pick<AIInterviewResponse, 'rounds_config'>): boolean {
  return (config.rounds_config ?? []).some(
    (round) => SKILL_ROUNDS.has(round.type) && round.enabled !== false && (round.topics?.length ?? 0) > 0,
  );
}

const configureHref = (id: string, jdId: string) => `${CONFIG_BASE}?jd_id=${jdId}&config_id=${id}`;

/** The Configure step of a version, for a freshly duplicated draft (V2…) that should open straight in edit. */
export const aiInterviewConfigureHref = (id: string, jdId: string) => configureHref(id, jdId);

/** The wizard step stamped into `special_instructions` by the last save, if any. */
function savedWizardStep(config: Pick<AIInterviewResponse, 'special_instructions'>): number | undefined {
  try {
    const step = JSON.parse(config.special_instructions || '{}')?.wizard_step;
    return typeof step === 'number' ? step : undefined;
  } catch {
    return undefined;
  }
}

export function aiInterviewDraftResumeHref(config: ResumeSource): string {
  // The recorded step wins: clusters generated on an earlier visit leave
  // topics behind, which must not drag a draft last saved on Configure forward.
  const step = savedWizardStep(config);
  if (step !== undefined && step >= 4) return `${CONFIG_BASE}/preview?id=${encodeURIComponent(config.id)}`;
  const hasClusters = step === undefined ? aiInterviewDraftHasClusters(config) : step >= 3;
  return hasClusters
    ? `${CONFIG_BASE}/clusters?id=${encodeURIComponent(config.id)}`
    : configureHref(config.id, config.jd_id || '');
}

/**
 * The same, for callers holding a list row: the list is fetched `compact`,
 * which may not carry the rounds, so the full config is read first. Falls back
 * to Configure (the previous Continue Editing target) if that read fails.
 */
export async function resolveAIInterviewDraftResumeHref(id: string, jdId: string): Promise<string> {
  try {
    const full = await aiInterviewService.get(id);
    if (full) return aiInterviewDraftResumeHref({ ...full, jd_id: full.jd_id || jdId });
  } catch { /* fall through to Configure */ }
  return configureHref(id, jdId);
}

/**
 * Which AI interview versions are still UNSAVED — created by the wizard but not
 * yet kept by the recruiter — so every wizard step's Discard can apply one rule:
 *
 *   - unsaved (a new interview's first draft, or the version Duplicate just
 *     minted) → Discard deletes it; earlier versions are untouched;
 *   - anything else (a draft the recruiter saved earlier and reopened, a
 *     published / live version) → Discard leaves it as last saved.
 *
 * A version is marked when the wizard creates it (Configure's first save) or
 * when Duplicate opens it, and unmarked only by Save as Draft. Continue moves
 * through the wizard without "keeping" the version — it stays unsaved until
 * the recruiter chooses to keep it.
 *
 * Held in sessionStorage, per version id: it survives a refresh, the browser's
 * Back and Continue → Back to Configure, unlike a URL flag. Another tab or
 * device does not see it, and then the safe default applies — the version is
 * treated as saved, so Discard never deletes it.
 */
const key = (id: string) => `ai_interview_unsaved_version:${id}`;

export function markUnsavedVersion(id: string): void {
  try { sessionStorage.setItem(key(id), '1'); } catch { /* storage unavailable: treated as saved */ }
}

export function isUnsavedVersion(id: string | null | undefined): boolean {
  if (!id) return false;
  try { return sessionStorage.getItem(key(id)) === '1'; } catch { return false; }
}

export function clearUnsavedVersion(id: string | null | undefined): void {
  if (!id) return;
  try { sessionStorage.removeItem(key(id)); } catch { /* nothing to clear */ }
}
