/**
 * Speech-to-Text (STT) model options for the AI interview.
 *
 * The recruiter picks one per interview on the Configure page; the chosen
 * `value` is persisted into special_instructions.stt_model and the backend
 * (asr_factory.py) resolves it to a concrete ASR provider for the live
 * interview. Keep the `value` tokens in sync with the backend factory.
 */
export interface SttModelOption {
  value: string;
  label: string;
  /** Short hint shown beneath the label in the dropdown. */
  note?: string;
  /** Renders a "Recommended" badge. */
  recommended?: boolean;
  /** True when the model can stream interim transcript text during the answer. */
  liveTranscript?: boolean;
}

export const STT_MODELS: SttModelOption[] = [
  { value: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe', note: 'OpenAI · final transcript after answer', recommended: true },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Highest accuracy · final transcript after answer' },
];

export const DEFAULT_STT_MODEL = 'gpt-4o-transcribe';

/** Resolve a stored token to its option (falls back to the default). */
export function getSttModelOption(value: string | undefined | null): SttModelOption {
  return (
    STT_MODELS.find(m => m.value === value) ??
    STT_MODELS.find(m => m.value === DEFAULT_STT_MODEL)!
  );
}
