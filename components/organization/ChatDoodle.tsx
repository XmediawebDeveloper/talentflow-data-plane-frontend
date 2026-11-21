'use client';

/* Team Chat — the conversation wallpaper: pencil-line doodles of hiring
   things (résumés, interviews, offers, calendars …) scattered behind the
   messages at a very low opacity, so text stays fully readable. Purely
   decorative: hidden from screen readers, never catches a click. */

import {
  Award, BarChart3, Briefcase, CalendarDays, ClipboardCheck, Clock, Coffee, FileText, GraduationCap, Handshake,
  Lightbulb, Mail, MessageSquare, Pencil, Search, Sparkles, Star, Target, UserCheck, Video, type LucideIcon,
} from 'lucide-react';

const DOODLES: LucideIcon[] = [
  FileText, Briefcase, Search, CalendarDays, Video, ClipboardCheck, Handshake, UserCheck, Star, Award,
  Target, Mail, MessageSquare, Sparkles, Clock, BarChart3, GraduationCap, Lightbulb, Coffee, Pencil,
];
const CELLS = 240;

export default function ChatDoodle() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden text-slate-600 opacity-[0.07] dark:text-slate-300 dark:opacity-[0.06]">
      <div className="grid gap-x-6 gap-y-5 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}>
        {Array.from({ length: CELLS }).map((_, i) => {
          const Icon = DOODLES[(i * 7) % DOODLES.length];
          // A fixed scatter: every icon upright, sizes and positions vary.
          const dx = ((i * 13) % 14) - 7;
          const dy = ((i * 29) % 12) - 6;
          const size = 16 + ((i * 11) % 5) * 3; // 16–28px
          return (
            <Icon key={i} strokeWidth={1.25} width={size} height={size}
              style={{ transform: `translate(${dx}px, ${dy}px)` }} />
          );
        })}
      </div>
    </div>
  );
}
