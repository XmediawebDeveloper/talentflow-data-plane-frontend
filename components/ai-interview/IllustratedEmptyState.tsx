import {
  ILLUSTRATION_ACCENT as ACCENT,
  ILLUSTRATION_DEEP,
  IllustratedEmptyState,
  Illustration,
} from '@/components/ui/illustrated-empty-state';

/* Empty states for the AI interview result's QR Verification and Recording
   tabs, on the shared illustrated empty-state card. */

function QrIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <circle cx="34" cy="62" r="4" fill="none" stroke={ACCENT} strokeWidth="2.5" />
          <path d="M168 12l2-7M175 20l6-5M178 30l8-1" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
          {/* Laptop */}
          <rect x="60" y="30" width="110" height="74" rx="7" fill={`url(#${ids.blue})`} />
          <rect x="67" y="37" width="96" height="60" rx="3" fill="#fff" />
          <path d="M46 104h138a2 2 0 012 2v2a6 6 0 01-6 6H50a6 6 0 01-6-6v-2a2 2 0 012-2z" fill={`url(#${ids.blue})`} />
          <rect x="104" y="104" width="22" height="3" rx="1.5" fill="#1F57C8" />
          {/* QR code */}
          <g fill="none" stroke={ACCENT} strokeWidth="3">
            <rect x="94" y="45" width="12" height="12" rx="1.5" />
            <rect x="116" y="45" width="12" height="12" rx="1.5" />
            <rect x="94" y="67" width="12" height="12" rx="1.5" />
            <path d="M89 50v-8h8M133 42h8v8M141 76v8h-8M97 84h-8v-8" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g fill={ACCENT}>
            <rect x="98" y="49" width="4" height="4" />
            <rect x="120" y="49" width="4" height="4" />
            <rect x="98" y="71" width="4" height="4" />
            <rect x="116" y="67" width="5" height="5" />
            <rect x="123" y="72" width="5" height="5" />
            <rect x="116" y="75" width="4" height="4" />
          </g>
          {/* Phone */}
          <rect x="166" y="46" width="42" height="74" rx="8" fill={`url(#${ids.light})`} />
          <rect x="170" y="53" width="34" height="61" rx="4" fill="#fff" />
          <rect x="182" y="49" width="10" height="2" rx="1" fill="#fff" opacity="0.8" />
          <rect x="180" y="72" width="14" height="14" rx="1" fill="#DCE9FF" />
          <path d="M176 72v-5h5M193 67h5v5M198 86v5h-5M181 91h-5v-5" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </Illustration>
  );
}

function RecordingIllustration() {
  return (
    <Illustration>
      {ids => (
        <>
          <circle cx="44" cy="86" r="4" fill="none" stroke={ACCENT} strokeWidth="2.5" />
          <circle cx="194" cy="80" r="4" fill="none" stroke={ACCENT} strokeWidth="2.5" />
          <path d="M182 24v12M176 30h12" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
          {/* Document behind the folder */}
          <path d="M98 10h38l16 16v46H98a4 4 0 01-4-4V14a4 4 0 014-4z" fill="#fff" stroke="#A9CBFF" strokeWidth="2" />
          <path d="M136 10v12a4 4 0 004 4h12" fill="#DCE9FF" stroke="#A9CBFF" strokeWidth="2" />
          <path d="M106 30h24M106 40h36" stroke="#7FB0FF" strokeWidth="3" strokeLinecap="round" />
          {/* Folder */}
          <path d="M76 56a8 8 0 018-8h24l8 8h48a8 8 0 018 8v52a8 8 0 01-8 8H84a8 8 0 01-8-8z" fill={`url(#${ids.blue})`} />
          <rect x="100" y="74" width="44" height="32" rx="6" fill="#fff" opacity="0.3" />
          <path d="M115 81l16 9-16 9z" fill="#fff" />
          {/* Clock */}
          <circle cx="166" cy="118" r="17" fill="#fff" stroke={ACCENT} strokeWidth="4" />
          <path d="M166 108v11h8" fill="none" stroke={ILLUSTRATION_DEEP} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Illustration>
  );
}

export function QrVerificationEmptyState({ message }: { message: string }) {
  return <IllustratedEmptyState illustration={<QrIllustration />} title={message} />;
}

export function RecordingExpiredEmptyState({ message }: { message: string }) {
  return <IllustratedEmptyState illustration={<RecordingIllustration />} description={message} />;
}
