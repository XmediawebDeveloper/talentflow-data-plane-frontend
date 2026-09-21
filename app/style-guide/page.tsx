'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import {
  Moon,
  Sun,
  Plus,
  Trash2,
  Download,
  Share2,
  Pencil,
  Archive,
  Sparkles,
  MoreVertical,
  Search,
  Bell,
  LayoutGrid,
  Info,
  CheckCircle2,
  Send,
  MessageSquare,
  Clock,
  XCircle,
  PlayCircle,
  Code2,
  Columns3,
  FolderOpen,
  Smartphone,
  AlertTriangle,
  Layers,
  PanelLeft,
  Check,
  X as XIcon,
  Briefcase,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Tooltip, InfoTooltip } from '@/components/ui/tooltip';
import { PageContainer, SurfaceCard, SectionHeading } from '@/components/ui/section-container';
import { PageHeader } from '@/components/ui/page-header';
import { PageToolbar } from '@/components/ui/page-toolbar';
import { EmptyState, SimpleEmptyState } from '@/components/ui/empty-state';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';

/** Section wrapper — every block on this page is one design category. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <SectionHeading title={title} description={description} />
      <SurfaceCard>{children}</SurfaceCard>
    </section>
  );
}

/** One color chip: swatch + token name + hex/var, click to copy the var(...) reference. */
function Swatch({ name, varName, hex }: { name: string; varName: string; hex?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(`var(${varName})`).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 p-2.5 text-left hover:border-brand-blue/40 transition-colors"
      title={`Click to copy var(${varName})`}
    >
      <span
        className="h-9 w-9 shrink-0 rounded-md border border-black/5 shadow-sm"
        style={{ background: `var(${varName})` }}
      />
      <span className="min-w-0">
        <div className="text-xs font-medium text-gray-900 dark:text-slate-100 truncate">{name}</div>
        <div className="text-2xs text-gray-500 dark:text-slate-400 truncate">
          {copied ? 'copied!' : hex ?? varName}
        </div>
      </span>
    </button>
  );
}

/** Callout tying a section back to a specific clause in the UI–UX guidelines doc. */
function GuidelineNote({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-xs leading-relaxed mb-4',
        tone === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300'
          : 'border-brand-blue/20 bg-brand-blue/5 text-gray-700 dark:border-brand-blue/30 dark:bg-brand-blue/10 dark:text-slate-300',
      )}
    >
      {children}
    </div>
  );
}

const NAV = [
  ['colors', 'Colors'],
  ['typography', 'Typography'],
  ['buttons', 'Buttons'],
  ['badges', 'Badges'],
  ['forms', 'Form controls'],
  ['cards', 'Cards'],
  ['layout', 'Navigation & Layout'],
  ['popups', 'Popups'],
  ['table', 'Table'],
  ['modules', 'Module Patterns'],
  ['feedback', 'Feedback & Performance'],
  ['accessibility', 'Accessibility'],
  ['empty', 'Empty states'],
  ['checklist', "Do / Don't"],
] as const;

export default function StyleGuidePage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [search, setSearch] = React.useState('');
  const [tab, setTab] = React.useState<'all' | 'active' | 'archived'>('all');
  const [checked, setChecked] = React.useState(true);
  const [switched, setSwitched] = React.useState(true);
  const [titleDraft, setTitleDraft] = React.useState('');
  const [sectionOpen, setSectionOpen] = React.useState(false);
  const [columns, setColumns] = React.useState({ name: true, email: true, score: true, matchType: false, date: true });
  const [autosaveDemo, setAutosaveDemo] = React.useState<'idle' | 'saving' | 'saved'>('idle');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sticky sub-nav */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-slate-50 shrink-0">
            <LayoutGrid className="w-5 h-5 text-brand-blue" />
            Design System
          </div>
          <nav className="flex-1 overflow-x-auto scrollbar-hide flex items-center gap-1">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100 transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
          <Button
            variant="secondary"
            size="sm"
            icon={resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
          </Button>
        </div>
      </div>

      <PageContainer>
        <PageHeader
          title="TalentFlow Design System"
          description="Live reference of every token, primitive, and layout pattern used in this app — toggle dark mode above to check both themes."
          icon={<Sparkles className="w-5 h-5" />}
        />

        <div className="flex flex-col gap-8">
          {/* ── Colors ───────────────────────────────────────────── */}
          <Section
            id="colors"
            title="Colors"
            description="Every color is a CSS variable in app/globals.css — never a hardcoded hex in a component."
          >
            <GuidelineNote>
              <strong>UI–UX Guidelines §11:</strong> "Primary brand color → Main CTAs. Neutral
              light background → Work areas. Red → Destructive. Green → Success. Yellow →
              Warning. <em>No Overuse of Colors — Max 3 dominant colors per screen.</em>" Grouped
              below by role, not by implementation, so the 3-color budget per screen is visible.
            </GuidelineNote>
            <div className="space-y-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                  1 of 3 — CTA color (main call-to-action buttons only)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  <Swatch name="Brand blue (CTA)" varName="--brand-blue" hex="#0f3c99" />
                  <Swatch name="Primary" varName="--primary" />
                  <Swatch name="Primary hover" varName="--primary-hover" />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                  2 of 3 — Neutral (backgrounds, borders, text — counts as ONE color for the budget)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  <Swatch name="Surface" varName="--surface" />
                  <Swatch name="Surface hover" varName="--surface-hover" />
                  <Swatch name="Border" varName="--border" />
                  <Swatch name="Border dark" varName="--border-dark" />
                  <Swatch name="Text primary" varName="--text-primary" />
                  <Swatch name="Text secondary" varName="--text-secondary" />
                  <Swatch name="Text muted" varName="--text-muted" />
                  <Swatch name="Secondary" varName="--secondary" />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                  3 of 3 — Semantic status (red / green / amber — use only the ones a screen needs)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  <Swatch name="Destructive (red)" varName="--destructive" />
                  <Swatch name="Success (green)" varName="--score-high" />
                  <Swatch name="Warning (amber)" varName="--score-medium" />
                  <Swatch name="Low / error (red)" varName="--score-low" />
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Swatch name="Invited" varName="--status-invited" />
                  <Swatch name="Expired" varName="--status-expired" />
                  <Swatch name="In progress" varName="--status-progress" />
                  <Swatch name="Completed" varName="--status-completed" />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                  Decorative accents — must stay non-dominant (icon glyphs / thin rings only, never a card or button fill)
                </div>
                <GuidelineNote tone="warning">
                  These 8 hues exist in the codebase (<code>DESIGN_SYSTEM.md</code> §2.2/§2.3) for
                  icon variety, but the guideline caps a screen at 3 <em>dominant</em> colors.
                  They're compliant only as small, repeated accents (a kebab-menu glyph, a badge
                  dot) — not as a card fill, button, or anything covering a meaningful area. A
                  screen leaning on 4+ of these as its loudest visual signal is a real violation,
                  even though each token individually is "just an icon color."
                </GuidelineNote>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  <Swatch name="Brand blue 2" varName="--brand-blue-2" hex="#0e3b98" />
                  <Swatch name="Brand cyan" varName="--brand-cyan" hex="#079cc4" />
                  <Swatch name="Brand teal" varName="--brand-teal" hex="#099ab6" />
                  <Swatch name="Brand orange" varName="--brand-orange" hex="#ed881c" />
                  <Swatch name="Brand orange deep" varName="--brand-orange-deep" hex="#d76011" />
                  <Swatch name="Brand peach" varName="--brand-peach" hex="#f9d0a4" />
                  <Swatch name="Brand sky" varName="--brand-sky" hex="#e0f2fe" />
                </div>
              </div>
            </div>
          </Section>

          {/* ── Typography ───────────────────────────────────────── */}
          <Section id="typography" title="Typography" description="One font family (Inter). A fixed size scale — never text-[Npx].">
            <GuidelineNote>
              <strong>UI–UX Guidelines §11:</strong> "Only one font family. Clear hierarchy:
              Heading → Subheading → Body → Meta." Use the sanctioned steps below — never an
              arbitrary <code>text-sm</code>. Font family is Inter for everything; only
              tabular/code data uses <code>font-mono</code>. A single <strong>Micro</strong> tier
              (<code>text-2xs</code>, 10px) exists for dense recruiter tables/chips — it replaces
              the ~1,200 scattered <code>text-[8–11px]</code> values with one token.
            </GuidelineNote>
            <div className="space-y-3">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                  Page title — text-2xl font-semibold
                </h1>
                <div className="text-2xs text-gray-400 dark:text-slate-500">Dashboard / top-level page name</div>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50 tracking-tight">
                  Heading — text-lg / text-xl font-semibold
                </h2>
                <div className="text-2xs text-gray-400 dark:text-slate-500">PageHeader title, card titles</div>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-50">
                  Subheading — text-base font-semibold
                </h3>
                <div className="text-2xs text-gray-400 dark:text-slate-500">SectionHeading inside a page or card</div>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Body — text-sm (the app's default body size)
                </p>
                <div className="text-2xs text-gray-400 dark:text-slate-500">Standard content, descriptions, form labels</div>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-500">
                  Meta — text-xs
                </p>
                <div className="text-2xs text-gray-400 dark:text-slate-500">Timestamps, counts, captions</div>
              </div>
              <div>
                <p className="text-2xs text-gray-500 dark:text-slate-500">
                  Micro — text-2xs (10px) · dense data only
                </p>
                <div className="text-2xs text-gray-400 dark:text-slate-500">Table cells, chips, badges in high-density recruiter views — nothing below this</div>
              </div>
              <code className="text-sm font-mono bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded inline-block">
                font-mono — tabular numbers &amp; code only
              </code>
            </div>
          </Section>

          {/* ── Buttons ──────────────────────────────────────────── */}
          <Section
            id="buttons"
            title="Buttons"
            description="Exactly THREE button variants exist — primary, secondary, destructive. There is no fourth. components/ui/button.tsx."
          >
            <GuidelineNote>
              <strong>UI–UX Guidelines §4:</strong> Primary = brand color, top-right/bottom-right,
              one per screen. Secondary = neutral, icon button, or dropdown menu — never a labeled
              button competing with the primary action. Destructive = always red, always behind a
              confirmation step. <code>danger / ghost / outline</code> are deprecated aliases that
              now resolve to these three.
            </GuidelineNote>

            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1">
                  1 · Primary — <code>variant=&quot;primary&quot;</code>
                </div>
                <div className="text-2xs text-gray-400 dark:text-slate-500 mb-2">
                  The single main CTA. Top-right / bottom-right. "Create JD", "Upload Resume", "Export".
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" size="sm">Small</Button>
                  <Button variant="primary" size="md">Medium</Button>
                  <Button variant="primary" size="lg">Large</Button>
                  <Button variant="primary" icon={<Plus className="w-4 h-4" />}>With icon</Button>
                  <Button variant="primary" loading>Loading</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1">
                  2 · Secondary — <code>variant=&quot;secondary&quot;</code>
                </div>
                <div className="text-2xs text-gray-400 dark:text-slate-500 mb-2">
                  Neutral supporting actions. Renders three ways — labeled, icon-only, or a kebab
                  dropdown — but it is one variant. "Edit", "Download", "Duplicate".
                </div>
                <div className="mb-3">
                  <div className="text-2xs uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">Labeled</div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" size="sm">Small</Button>
                    <Button variant="secondary" size="md">Medium</Button>
                    <Button variant="secondary" size="lg">Large</Button>
                    <Button variant="secondary" icon={<Pencil className="w-4 h-4" />}>Edit</Button>
                    <Button variant="secondary" disabled>Disabled</Button>
                  </div>
                </div>
                <div className="mb-3">
                  <div className="text-2xs uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">Icon-only + kebab dropdown</div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="secondary" size="sm" aria-label="Download" className="px-2"><Download className="w-4 h-4" /></Button>
                    <Button variant="secondary" size="sm" aria-label="Edit" className="px-2"><Pencil className="w-4 h-4" /></Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" aria-label="More actions" className="px-2"><MoreVertical className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem><Download className="w-4 h-4 mr-2" />Download</DropdownMenuItem>
                        <DropdownMenuItem><Share2 className="w-4 h-4 mr-2" />Duplicate</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <GuidelineNote tone="warning">
                  <strong>Watch for:</strong> a row that grows a labeled button per action
                  (Edit, View, Archive, Disable, side by side) instead of collapsing the
                  non-primary ones into a kebab dropdown — that's the toolbar-clutter pattern §4
                  warns against, even when each button is individually icon-only.
                </GuidelineNote>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1">
                  3 · Destructive — <code>variant=&quot;destructive&quot;</code>
                </div>
                <div className="text-2xs text-gray-400 dark:text-slate-500 mb-2">
                  Always red. Never fires directly — must be wrapped in a confirmation step
                  (see AlertDialog under Popups). "Delete JD", "Delete Resume".
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="destructive" size="sm">Small</Button>
                  <Button variant="destructive" size="md">Medium</Button>
                  <Button variant="destructive" size="lg">Large</Button>
                  <Button variant="destructive" icon={<Trash2 className="w-4 h-4" />}>Delete</Button>
                  <Button variant="destructive" loading>Loading</Button>
                  <Button variant="destructive" disabled>Disabled</Button>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-1">
                  Modifier · <code>tone=&quot;onColor&quot;</code>
                </div>
                <div className="text-2xs text-gray-400 dark:text-slate-500 mb-2">
                  A <strong>modifier</strong>, not a 4th variant — the same three variants, restyled for
                  buttons that sit on a dark, gradient, on-video, or colored-header surface (candidate
                  exam screens, colored page banners, floating overlays). Primary inverts to white;
                  secondary becomes translucent white; destructive keeps red with a white ring.
                </div>
                <div className="rounded-xl p-5 bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-cyan)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="primary" tone="onColor">Primary</Button>
                    <Button variant="secondary" tone="onColor" icon={<Download className="w-4 h-4" />}>Secondary</Button>
                    <Button variant="secondary" tone="onColor" aria-label="More" className="px-2"><MoreVertical className="w-4 h-4" /></Button>
                    <Button variant="destructive" tone="onColor" icon={<Trash2 className="w-4 h-4" />}>Delete</Button>
                    <Button variant="primary" tone="onColor" disabled>Disabled</Button>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Badges ───────────────────────────────────────────── */}
          <Section id="badges" title="Badges" description="8 semantic variants. components/ui/badge.tsx">
            <div className="flex flex-wrap gap-2">
              <Badge>default</Badge>
              <Badge variant="secondary">secondary</Badge>
              <Badge variant="destructive">destructive</Badge>
              <Badge variant="outline">outline</Badge>
              <Badge variant="success">success</Badge>
              <Badge variant="warning">warning</Badge>
              <Badge variant="info">info</Badge>
              <Badge variant="muted">muted</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="info"><Info className="w-3 h-3" /> Invited</Badge>
              <Badge variant="warning">Expired</Badge>
              <Badge className="ring-brand-cyan/15 bg-brand-cyan/10 text-brand-cyan">In progress</Badge>
              <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>
            </div>
          </Section>

          {/* ── Form controls ────────────────────────────────────── */}
          <Section id="forms" title="Form controls" description="Input, textarea, select, checkbox, switch, tabs.">
            <GuidelineNote>
              <strong>UI–UX Guidelines §5:</strong> "Short Forms Only — use sections with
              collapsible groups if needed. Inline Validation — errors must appear immediately,
              no validation after full submit only. Auto-Save Behavior — any partially completed
              JD, Assessment, or Candidate entry must auto-save as a draft."
            </GuidelineNote>

            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                Inline validation — error shows as you type, not on submit
              </div>
              <div className="max-w-sm space-y-1.5">
                <Label htmlFor="sg-inline-validate">Job title</Label>
                <Input
                  id="sg-inline-validate"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  aria-invalid={titleDraft.length > 0 && titleDraft.length < 3}
                  placeholder="e.g. Senior Backend Engineer"
                />
                {titleDraft.length > 0 && titleDraft.length < 3 && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <XIcon className="w-3 h-3" /> Title must be at least 3 characters
                  </p>
                )}
                {titleDraft.length >= 3 && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Looks good
                  </p>
                )}
              </div>
              <div className="text-2xs text-gray-400 dark:text-slate-500 mt-2">
                No app form currently ships this (every form validates via toast-on-submit
                today) — this is the target pattern, wired with plain state here to demonstrate
                the behavior without pulling in react-hook-form.
              </div>
            </div>

            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                Collapsible section — long forms split into groups, not one scroll
              </div>
              <Collapsible open={sectionOpen} onOpenChange={setSectionOpen} className="max-w-sm rounded-lg border border-gray-200 dark:border-slate-700">
                <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg">
                  <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-gray-400" /> Compensation & Benefits</span>
                  <span className="text-2xs text-gray-400">{sectionOpen ? 'Hide' : 'Show'}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3 space-y-2 border-t border-gray-100 dark:border-slate-800">
                  <Input placeholder="Min salary" className="mt-2" />
                  <Input placeholder="Max salary" />
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="sg-input">Text input</Label>
                <Input id="sg-input" placeholder="e.g. Senior Backend Engineer" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sg-select">Select</Label>
                <Select defaultValue="active">
                  <SelectTrigger id="sg-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sg-textarea">Textarea</Label>
                <Textarea id="sg-textarea" placeholder="Job description…" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="sg-checkbox" checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
                <Label htmlFor="sg-checkbox">Checkbox</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="sg-switch" checked={switched} onCheckedChange={setSwitched} />
                <Label htmlFor="sg-switch">Switch</Label>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                Tabs
              </div>
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="archived">Archived</TabsTrigger>
                </TabsList>
                <TabsContent value={tab} className="text-sm text-gray-600 dark:text-slate-400 pt-2">
                  Showing “{tab}” tab content.
                </TabsContent>
              </Tabs>
            </div>

            <div className="mt-6 flex items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-slate-300">Info tooltip:</span>
              <InfoTooltip content="This is a portalled, viewport-clamped tooltip." />
              <span className="ml-4 text-sm text-gray-700 dark:text-slate-300">Custom tooltip:</span>
              <Tooltip content="Custom tooltip content">
                <span className="underline decoration-dotted cursor-help text-sm">hover me</span>
              </Tooltip>
            </div>
          </Section>

          {/* ── Cards ────────────────────────────────────────────── */}
          <Section id="cards" title="Cards" description="shadcn Card (header/action/content/footer slots) vs. SurfaceCard (plain panel).">
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Open Positions</CardTitle>
                  <CardDescription>Jobs currently accepting applications</CardDescription>
                  <CardAction>
                    <Badge variant="info">12 active</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    Card / CardHeader / CardTitle / CardDescription / CardAction / CardContent / CardFooter —
                    components/ui/card.tsx
                  </p>
                </CardContent>
                <CardFooter>
                  <Button variant="secondary" size="sm">View all</Button>
                </CardFooter>
              </Card>

              <SurfaceCard>
                <SectionHeading title="Surface card" description="Plain panel — used for generic content blocks inside a page." />
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  components/ui/section-container.tsx — same border/ring/shadow recipe as PageToolbar.
                </p>
              </SurfaceCard>
            </div>
          </Section>

          {/* ── Navigation & Layout ────────────────────────────────── */}
          <Section id="layout" title="Navigation & Layout" description="SaaS-first shell, max 2 levels of navigation, context always visible.">
            <GuidelineNote>
              <strong>UI–UX Guidelines §2/§3:</strong> "Persistent left sidebar for main modules.
              Fixed top header for profile/notifications/plan/quick actions... Maximum depth:
              2 levels only... Context Must Always Be Visible — when inside a JD, the JD name
              must always appear at the top."
            </GuidelineNote>

            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
              SaaS shell — persistent sidebar + fixed top bar + content area
            </div>
            <div className="flex h-56 rounded-lg border border-dashed border-gray-300 dark:border-slate-700 overflow-hidden mb-6">
              <div className="w-36 shrink-0 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] p-2 flex flex-col gap-1">
                <div className="flex items-center gap-1.5 px-1.5 py-1 mb-1"><PanelLeft className="w-3.5 h-3.5" /><span className="text-2xs font-semibold uppercase tracking-wide opacity-70">Recruitment</span></div>
                {['Job Descriptions', 'Resume Scoring', 'Assessments', 'AI Talent Match'].map((item, i) => (
                  <div key={item} className={cn('text-2xs px-2 py-1.5 rounded-md', i === 0 ? 'bg-[var(--sidebar-active)]' : 'opacity-70')}>{item}</div>
                ))}
              </div>
              <div className="flex-1 flex flex-col">
                <div className="h-9 shrink-0 flex items-center justify-between px-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <span className="text-2xs font-medium text-gray-500 dark:text-slate-400">Job Descriptions</span>
                  <div className="flex items-center gap-2 text-gray-400"><Bell className="w-3.5 h-3.5" /><div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-700" /></div>
                </div>
                <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-3 text-2xs text-gray-400 dark:text-slate-500">Content area — every workflow renders here, no full-page reloads for primary actions</div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 mb-2 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> OK — 2 levels</div>
                <div className="text-sm text-gray-700 dark:text-slate-300 font-mono">JD → Scored Resumes</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-2 flex items-center gap-1"><XIcon className="w-3.5 h-3.5" /> Not allowed — 3 levels</div>
                <div className="text-sm text-gray-700 dark:text-slate-300 font-mono">JD → Details → History → Export</div>
              </div>
            </div>

            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
              Context always visible — entity name pinned at the top of every sub-view
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 mb-6">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">
                <Briefcase className="w-4 h-4 text-brand-blue" /> Senior Backend Engineer <Badge variant="outline" className="ml-1">JD-0142</Badge>
              </div>
              <div className="text-2xs text-gray-400 dark:text-slate-500">Scored Resumes tab — the JD name stays pinned however deep the recruiter scrolls, so it's never ambiguous which JD this data belongs to.</div>
            </div>

            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
              Page shell — PageContainer → PageHeader → PageToolbar → SurfaceCard
            </div>
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-700 p-3 sm:p-4 bg-slate-50/60 dark:bg-slate-950/40">
              <PageHeader
                className="mb-3"
                title="Job Openings"
                description="Manage roles across your organization"
                icon={<LayoutGrid className="w-5 h-5" />}
                actions={<Button size="sm" icon={<Plus className="w-4 h-4" />}>New job</Button>}
              />
              <PageToolbar className="mb-0">
                <PageToolbar.Row>
                  <PageToolbar.Search value={search} onChange={setSearch} placeholder="Search jobs…" />
                  <PageToolbar.Filters>
                    <PageToolbar.FilterButton active icon={<Bell className="w-4 h-4" />}>
                      Alerts
                    </PageToolbar.FilterButton>
                  </PageToolbar.Filters>
                </PageToolbar.Row>
                <PageToolbar.Tabs
                  value={tab}
                  onChange={(v) => setTab(v)}
                  options={[
                    { value: 'all', label: 'All', count: 24 },
                    { value: 'active', label: 'Active', count: 12 },
                    { value: 'archived', label: 'Archived', count: 12 },
                  ]}
                />
              </PageToolbar>
            </div>
          </Section>

          {/* ── Popups ───────────────────────────────────────────── */}
          <Section id="popups" title="Popups" description="Dialog, alert dialog, popover, dropdown menu, sheet — all Radix-based.">
            <GuidelineNote>
              <strong>UI–UX Guidelines §1/§3:</strong> "Most user actions must happen within the
              same screen... Use: Modals, Slide-in panels, Inline forms, Expandable rows... All
              CRUD Must Be Inline — open in a side panel or modal, not a redirect." These five
              primitives are the mechanism for that rule — reach for one before adding a new
              route for a create/edit/view/delete action.
            </GuidelineNote>
            <div className="flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Dialog (modal)</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit job title</DialogTitle>
                    <DialogDescription>components/ui/dialog.tsx — centered modal, backdrop blur.</DialogDescription>
                  </DialogHeader>
                  <Input defaultValue="Senior Backend Engineer" />
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <DialogClose asChild><Button>Save</Button></DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="danger" icon={<Trash2 className="w-4 h-4" />}>Alert dialog</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this job posting?</AlertDialogTitle>
                    <AlertDialogDescription>
                      components/ui/alert-dialog.tsx — for confirmations. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <div className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Quick filters</div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">components/ui/popover.tsx — anchored, non-modal.</p>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" icon={<MoreVertical className="w-4 h-4" />}>Actions ⋮</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Row actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem><Share2 className="text-menu-icon-share" /> Share</DropdownMenuItem>
                  <DropdownMenuItem><Download className="text-menu-icon-download" /> Download</DropdownMenuItem>
                  <DropdownMenuItem><Pencil className="text-menu-icon-edit" /> Edit</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive"><Archive /> Archive</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="secondary">Sheet (drawer)</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>components/ui/sheet.tsx — slides in from a screen edge.</SheetDescription>
                  </SheetHeader>
                  <div className="px-4 sm:px-5 text-sm text-gray-600 dark:text-slate-400">
                    Panel content goes here.
                  </div>
                  <SheetFooter>
                    <Button variant="outline">Reset</Button>
                    <Button>Apply</Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
          </Section>

          {/* ── Table ────────────────────────────────────────────── */}
          <Section id="table" title="Table" description=".tf-table-shell — sticky header, single scroll container, sticky-column helper.">
            <div className="tf-table-shell tf-table-shell--compact border border-gray-200 dark:border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-slate-300">Candidate</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-slate-300">Role</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-slate-300">Score</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Aditi Rao', 'Backend Engineer', 92, 'completed'],
                    ['Marcus Lee', 'Product Designer', 74, 'progress'],
                    ['Sara Kim', 'Data Analyst', 48, 'expired'],
                  ].map(([name, role, score, status]) => (
                    <tr key={name as string} className="border-t border-gray-200 dark:border-slate-700">
                      <td className="px-3 py-2 text-gray-900 dark:text-slate-100">{name}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-slate-400">{role}</td>
                      <td className="px-3 py-2">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            color: `var(--score-${(score as number) >= 80 ? 'high' : (score as number) >= 60 ? 'medium' : 'low'})`,
                            background: `var(--score-${(score as number) >= 80 ? 'high' : (score as number) >= 60 ? 'medium' : 'low'}-bg)`,
                          }}
                        >
                          {score}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-status-${status} text-xs font-medium capitalize`}>{status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── Module Patterns ──────────────────────────────────── */}
          <Section id="modules" title="Module Patterns" description="Resume Database, Resume Scoring, Assessment, Coding Assessment, Mobile — §6–§10.">
            <div className="space-y-8">
              <div>
                <GuidelineNote>
                  <strong>UI–UX Guidelines §6:</strong> "Two Clear Zones — My Resumes, Internal
                  Database. Search Must Be Always Visible — sticky search bar, filters collapse
                  into a drawer. Bulk Operations — checkbox-based selection, one-click bulk
                  upload/score/invite/download."
                </GuidelineNote>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Resume Database</div>
                <Tabs defaultValue="my-resumes">
                  <TabsList>
                    <TabsTrigger value="my-resumes"><FolderOpen className="w-3.5 h-3.5" /> My Resumes</TabsTrigger>
                    <TabsTrigger value="internal-db">Internal Database</TabsTrigger>
                  </TabsList>
                </Tabs>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-900">
                  <Search className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-400 dark:text-slate-500">Sticky search — stays visible while the list scrolls</span>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-blue/5 border border-brand-blue/20 px-3 py-2">
                  <Checkbox checked className="pointer-events-none" />
                  <span className="text-sm text-gray-700 dark:text-slate-300">3 selected</span>
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" icon={<Send className="w-3.5 h-3.5" />}>Submit for Scoring</Button>
                    <Button size="sm" variant="outline" icon={<Download className="w-3.5 h-3.5" />}>Download</Button>
                  </span>
                </div>
              </div>

              <div>
                <GuidelineNote>
                  <strong>UI–UX Guidelines §7:</strong> "JD-Wise Scoring View — never mixed across
                  JDs. Dynamic Column Selection — column count adapts to screen width. Export
                  Without Navigation — happens in the same screen."
                </GuidelineNote>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Resume Scoring — dynamic columns</div>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(columns) as (keyof typeof columns)[]).map((key) => (
                    <label key={key} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-slate-300">
                      <Checkbox checked={columns[key]} onCheckedChange={(v) => setColumns((c) => ({ ...c, [key]: !!v }))} />
                      <span className="capitalize">{key === 'matchType' ? 'Match Type' : key}</span>
                    </label>
                  ))}
                </div>
                <div className="text-2xs text-gray-400 dark:text-slate-500 mt-2 flex items-center gap-1"><Columns3 className="w-3 h-3" /> {Object.values(columns).filter(Boolean).length} of {Object.keys(columns).length} columns shown — same idea as the table below adapting its visible columns to viewport width</div>
              </div>

              <div>
                <GuidelineNote>
                  <strong>UI–UX Guidelines §8:</strong> "Single Configuration Screen — JD
                  selection, sections, percentages, custom topics all on one screen. Real-Time
                  Status Panels — Invitation Sent, Link Opened, Test Started, Completed,
                  Failed/Abandoned."
                </GuidelineNote>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Assessment — real-time status panel</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { label: 'Invited', icon: Send, cls: 'text-status-invited bg-status-invited/10 ring-status-invited/20' },
                    { label: 'Link Opened', icon: MessageSquare, cls: 'text-status-progress bg-status-progress/10 ring-status-progress/20' },
                    { label: 'Test Started', icon: PlayCircle, cls: 'text-status-progress bg-status-progress/10 ring-status-progress/20' },
                    { label: 'Completed', icon: CheckCircle2, cls: 'text-status-completed bg-status-completed/10 ring-status-completed/20' },
                    { label: 'Failed', icon: XCircle, cls: 'text-red-600 bg-red-50 ring-red-200' },
                  ].map(({ label, icon: Icon, cls }) => (
                    <div key={label} className={cn('rounded-lg ring-1 p-2.5 text-center', cls)}>
                      <Icon className="w-4 h-4 mx-auto mb-1" />
                      <div className="text-2xs font-medium">{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <GuidelineNote>
                  <strong>UI–UX Guidelines §9:</strong> "Automatic Compiler Loading — same screen
                  as the question, no tab switching. Split View — Left: Question, Right:
                  Compiler, Bottom: Output. Run & Submit Always Visible."
                </GuidelineNote>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Coding Assessment — split view</div>
                <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <div className="grid grid-cols-2 h-24">
                    <div className="p-2.5 border-r border-gray-200 dark:border-slate-700 text-2xs text-gray-500 dark:text-slate-400 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Question</div>
                    <div className="p-2.5 bg-gray-900 text-2xs text-gray-300 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" /> Compiler</div>
                  </div>
                  <div className="flex items-center justify-between px-2.5 py-2 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
                    <span className="text-2xs text-gray-400">Output & Errors</span>
                    <span className="flex gap-1.5">
                      <Button size="sm" variant="outline">Run</Button>
                      <Button size="sm" variant="primary">Submit</Button>
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <GuidelineNote>
                  <strong>UI–UX Guidelines §10:</strong> "No Table Views on Mobile — all tables
                  convert into card views, each card shows primary information only. Bottom
                  Sheet Actions — secondary actions open as bottom sheets."
                </GuidelineNote>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2 flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Mobile — table row becomes a card, not a scroll-only table</div>
                <div className="max-w-xs rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-100">Aditi Rao</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: 'var(--score-high)', background: 'var(--score-high-bg)' }}>92</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">Backend Engineer</div>
                  <div className="text-2xs text-gray-400 mt-1">Tap for secondary actions → opens a Sheet from the bottom (see Popups), not a hidden row of buttons.</div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Feedback & Performance ───────────────────────────── */}
          <Section id="feedback" title="Feedback & Performance" description="Toasts, progress, skeleton loaders — §12/§13.">
            <GuidelineNote>
              <strong>UI–UX Guidelines §12/§13:</strong> "Every Action Must Give Feedback — no
              silent failures, every error explains what went wrong and what to do next.
              Progress Indicators must always show live progress for bulk upload/AI
              generation/large exports. No White Screens — skeleton loaders appear immediately.
              Async operations must never block the UI."
            </GuidelineNote>

            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Toast feedback — sonner, wired to real actions elsewhere in the app</div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" size="sm" onClick={() => toast.success('Resume uploaded successfully')}>Trigger success</Button>
                <Button variant="secondary" size="sm" onClick={() => toast.error('Upload failed — file exceeds 10MB. Try a smaller file.')}>Trigger error</Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAutosaveDemo('saving');
                    const id = toast.loading('Scoring 42 resumes…');
                    setTimeout(() => {
                      toast.success('Scoring completed', { id });
                      setAutosaveDemo('saved');
                    }, 1500);
                  }}
                >
                  Trigger progress → complete
                </Button>
              </div>
              {autosaveDemo !== 'idle' && (
                <div className="text-2xs text-gray-400 dark:text-slate-500 mt-2">
                  Demo state: <span className="font-mono">{autosaveDemo}</span> — errors must explain what went wrong AND what to do next (see the error toast copy above), not just "Failed".
                </div>
              )}
            </div>

            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Progress indicator — bulk upload / AI generation / large exports</div>
              <div className="max-w-sm space-y-1.5">
                <Progress value={64} />
                <div className="text-2xs text-gray-400 dark:text-slate-500">Scoring 27 of 42 resumes…</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">Skeleton loaders — no white screen while data loads</div>
              <div className="flex flex-wrap items-start gap-4">
                <div className="space-y-2 w-40">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="w-full max-w-md scale-90 origin-top-left -mb-6">
                  <TableSkeleton rows={2} columns={3} />
                </div>
              </div>
            </div>
          </Section>

          {/* ── Accessibility ─────────────────────────────────────── */}
          <Section id="accessibility" title="Accessibility" description="Keyboard nav, focus, contrast, tooltips — §14.">
            <GuidelineNote>
              <strong>UI–UX Guidelines §14:</strong> "Keyboard navigable. Clear focus indicators.
              Readable contrast. Descriptive tooltips on all icons."
            </GuidelineNote>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                <div className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-2">Keyboard navigable + focus indicators</div>
                <p className="text-2xs text-gray-400 dark:text-slate-500 mb-2">Tab to this button — the ring is a global rule in app/globals.css, not styled per-component.</p>
                <Button variant="outline" size="sm">Tab to me</Button>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                <div className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-2">Readable contrast</div>
                <p className="text-2xs text-gray-400 dark:text-slate-500 mb-2">The accent hover pair (Colors §2.2/2.3 in DESIGN_SYSTEM.md) was fixed from 2.35:1 to 7.56:1 specifically for this rule.</p>
                <div className="inline-block rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm">Hovered menu item</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 sm:col-span-2">
                <div className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-2">Descriptive tooltips on icon-only controls</div>
                <p className="text-2xs text-gray-400 dark:text-slate-500 mb-2">Every icon-only trigger (kebab menus, info glyphs — see Popups and Form controls above) needs both <code>aria-label</code> and a visible tooltip, not just one.</p>
                <div className="flex items-center gap-3">
                  <Tooltip content="More actions">
                    <button aria-label="More actions" className="h-8 w-8 flex items-center justify-center rounded-md border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                      <MoreVertical className="w-4 h-4 text-gray-600 dark:text-slate-300" />
                    </button>
                  </Tooltip>
                  <span className="text-2xs text-gray-400 dark:text-slate-500">aria-label="More actions" + Tooltip, together</span>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Empty states ─────────────────────────────────────── */}
          <Section id="empty" title="Empty states" description="EmptyState (full block, with CTA) and SimpleEmptyState (inline, for tables/lists).">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 dark:border-slate-700">
                <EmptyState
                  icon={Search}
                  title="No results found"
                  description="Try adjusting your search or filters to find what you're looking for."
                  action={{ label: 'Clear filters', onClick: () => {} }}
                  secondaryAction={{ label: 'Reset search', onClick: () => {} }}
                />
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center">
                <SimpleEmptyState message="No invites sent yet" suggestion="Invitations you send will appear here" />
              </div>
            </div>
          </Section>

          {/* ── Do / Don't checklist ─────────────────────────────── */}
          <Section id="checklist" title="Do / Don't" description="§15 Strict Prohibitions — the baseline every screen must clear.">
            <GuidelineNote>
              <strong>UI–UX Guidelines §15:</strong> these are stated as hard "Must NOT" rules,
              not preferences. <strong>§16:</strong> the product should feel "Fast, Professional,
              Predictable, Non-confusing" — a recruiter should upload, find, score, assess, and
              export "with minimum clicks and no learning curve."
            </GuidelineNote>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { bad: 'Full page reload for a form', good: 'Modal / slide-in panel / inline expansion' },
                { bad: 'Full navigation for a small task', good: 'Stay on the same screen, act inline' },
                { bad: 'Hidden or buried primary action', good: 'One primary CTA, top-right or bottom-right' },
                { bad: 'Inconsistent button placement across screens', good: 'Same primary/secondary/destructive tiers everywhere' },
                { bad: 'Multi-step wizard for a simple task', good: 'Single screen with collapsible sections' },
                { bad: 'Resume Scoring, Talent Match & Assessment mixed on one screen', good: 'Each module owns its own screen, cross-linked, not merged' },
              ].map((row) => (
                <div key={row.bad} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 space-y-1.5">
                  <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                    <XIcon className="w-4 h-4 shrink-0 mt-0.5" /> <span>{row.bad}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
                    <Check className="w-4 h-4 shrink-0 mt-0.5" /> <span>{row.good}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </PageContainer>
    </div>
  );
}
