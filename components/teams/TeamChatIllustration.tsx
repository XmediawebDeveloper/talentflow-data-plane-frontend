import { ILLUSTRATION_ACCENT as ACCENT, Illustration } from '@/components/ui/illustrated-empty-state';

/** Team Chat's welcome drawing: a blue message bubble over a white typing one. */
export default function TeamChatIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <circle cx="36" cy="70" r="4" fill="none" stroke={ACCENT} strokeWidth="2.5" />
          <path d="M184 18v12M178 24h12" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
          <path d="M200 56q1 5 6 6q-5 1-6 6q-1-5-6-6q5-1 6-6z" fill={ACCENT} />
          {/* White typing bubble, behind */}
          <path
            d="M128 62h46a10 10 0 0110 10v24a10 10 0 01-10 10h-34l-12 9v-9a10 10 0 01-10-10V72a10 10 0 0110-10z"
            fill="var(--raw-ffffff)"
            stroke="var(--raw-dce6f7)"
            strokeWidth="1.5"
          />
          <g fill={ACCENT}>
            <circle cx="141" cy="84" r="4" />
            <circle cx="155" cy="84" r="4" />
            <circle cx="169" cy="84" r="4" />
          </g>
          {/* Blue message bubble, in front */}
          <path
            d="M70 30h62a10 10 0 0110 10v30a10 10 0 01-10 10H88l-14 12V80h-4a10 10 0 01-10-10V40a10 10 0 0110-10z"
            fill={`url(#${ids.blue})`}
          />
          <path d="M78 48h44M78 62h30" stroke="var(--raw-ffffff)" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </Illustration>
  );
}
