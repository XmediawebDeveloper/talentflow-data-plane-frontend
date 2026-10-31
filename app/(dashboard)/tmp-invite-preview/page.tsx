'use client';

// TEMP: opens the invite popup for a live check — deleted after the run.
import VersionInviteDialog from '@/components/talent-match-invite/VersionInviteDialog';

export default function Page() {
  return <VersionInviteDialog kind="assessment" jdId="jd-inv-1" jdCode="JD-339" jdTitle="Food Tester" jobVersionNumber={1} onClose={() => {}} />;
}
