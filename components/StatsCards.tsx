'use client'

import { FileText, Calendar, Folder, TrendingUp, CheckCircle, Target } from 'lucide-react';

interface StatCard {
  type: 'total' | 'monthly' | 'folders' | 'applied' | 'available';
  value: number;
}

interface StatsCardsProps {
  cards: StatCard[];
}

export default function StatsCards({ cards }: StatsCardsProps) {
  const renderCard = (card: StatCard) => {
    switch (card.type) {
      case 'total':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-gray-500">Total Resumes</span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">{card.value.toLocaleString()}</div>
            <div className="text-xs text-gray-500">In your collection</div>
          </div>
        );

      case 'monthly':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-gray-500">Resumes This Month</span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">{card.value}</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="w-3 h-3" />
              <span>+12% vs last month</span>
            </div>
          </div>
        );

      case 'folders':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Folder className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm text-gray-500">Folders</span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">{card.value}</div>
            <div className="text-xs text-gray-500">Organized collections</div>
          </div>
        );

      case 'applied':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-gray-500">Applied to Jobs</span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">{card.value.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Candidates actioned</div>
          </div>
        );

      case 'available':
        return (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-gray-500">Available Candidates</span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">{card.value.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Ready to apply</div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`grid grid-cols-1 gap-6 mb-6 ${cards.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {cards.map((card, index) => (
        <div key={index}>
          {renderCard(card)}
        </div>
      ))}
    </div>
  );
}