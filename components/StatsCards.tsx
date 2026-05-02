'use client'

import { FileText, Calendar, Folder, TrendingUp, CheckCircle, Target, LucideIcon } from 'lucide-react';

interface StatCard {
  type: 'total' | 'monthly' | 'folders' | 'applied' | 'available';
  value: number;
}

interface StatsCardsProps {
  cards: StatCard[];
}

interface CardConfig {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  hint: string | { text: string; type: 'trend' };
  format?: (n: number) => string;
}

const CARD_CONFIG: Record<StatCard['type'], CardConfig> = {
  total: {
    icon: FileText,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    label: 'Total Resumes',
    hint: 'In your collection',
    format: (n) => n.toLocaleString(),
  },
  monthly: {
    icon: Calendar,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    label: 'Resumes This Month',
    hint: { text: '+12% vs last month', type: 'trend' },
  },
  folders: {
    icon: Folder,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    label: 'Folders',
    hint: 'Organized collections',
  },
  applied: {
    icon: CheckCircle,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
    label: 'Applied to Jobs',
    hint: 'Candidates actioned',
    format: (n) => n.toLocaleString(),
  },
  available: {
    icon: Target,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    label: 'Available Candidates',
    hint: 'Ready to apply',
    format: (n) => n.toLocaleString(),
  },
};

export default function StatsCards({ cards }: StatsCardsProps) {
  const renderCard = (card: StatCard) => {
    const config = CARD_CONFIG[card.type];
    if (!config) return null;
    const { icon: Icon, iconBg, iconColor, label, hint, format } = config;
    const value = format ? format(card.value) : card.value;
    const isTrend = typeof hint === 'object';

    return (
      <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-4 sm:p-5 transition-shadow hover:shadow-md">
        <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${iconColor}`} />
          </div>
          <span className="text-xs sm:text-sm text-muted-foreground font-medium truncate">{label}</span>
        </div>
        <div className="text-2xl sm:text-3xl font-semibold text-foreground mb-1 tracking-tight tabular-nums">
          {value}
        </div>
        {isTrend ? (
          <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
            <TrendingUp className="w-3 h-3" />
            <span>{hint.text}</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{hint as string}</div>
        )}
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 ${cards.length === 3 ? 'lg:grid-cols-3' : cards.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}>
      {cards.map((card, index) => (
        <div key={index}>
          {renderCard(card)}
        </div>
      ))}
    </div>
  );
}
