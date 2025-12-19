'use client';

import { CreditCard, Check, Zap, TrendingUp, Calendar, Users, ArrowRight } from 'lucide-react';
import { useState } from 'react';

const plans = [
  {
    name: 'Basic',
    price: '$29',
    period: 'month',
    features: ['5 Job Postings', '100 Resume Scans', 'Basic AI Matching', 'Email Support'],
    current: false,
  },
  {
    name: 'Professional',
    price: '$79',
    period: 'month',
    features: ['25 Job Postings', '500 Resume Scans', 'Advanced AI Matching', 'AI Interviews', 'Priority Support'],
    current: true,
  },
  {
    name: 'Enterprise',
    price: '$199',
    period: 'month',
    features: ['Unlimited Jobs', 'Unlimited Scans', 'Custom AI Models', 'API Access', 'Dedicated Support', 'Custom Integrations'],
    current: false,
  },
];

export default function CurrentPlanPage() {
  const currentPlan = plans.find(p => p.current);

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Current Plan</h1>
              <p className="text-sm text-gray-600">Manage your subscription and billing</p>
            </div>
          </div>
        </div>

        {/* Current Plan Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Your Current Plan</h2>
              <p className="text-sm text-gray-600">You are currently on the Professional plan</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Active</span>
          </div>
          <div className="grid grid-cols-4 gap-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Plan</p>
              <p className="text-xl font-semibold text-gray-900">{currentPlan?.name}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Price</p>
              <p className="text-xl font-semibold text-gray-900">{currentPlan?.price}<span className="text-sm font-normal text-gray-500">/month</span></p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Next Billing</p>
              <p className="text-xl font-semibold text-gray-900">Jan 15, 2025</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Team Seats</p>
              <p className="text-xl font-semibold text-gray-900">5 / 10</p>
            </div>
          </div>
        </div>

        {/* All Plans */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Plans</h2>
        <div className="grid grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-xl shadow-sm border p-6 ${
                plan.current ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
              }`}
            >
              {plan.current && (
                <span className="inline-flex px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium mb-4">
                  Current Plan
                </span>
              )}
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{plan.name}</h3>
              <p className="text-3xl font-bold text-gray-900 mb-4">
                {plan.price}<span className="text-sm font-normal text-gray-500">/{plan.period}</span>
              </p>
              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-green-600" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`w-full py-2 rounded-lg font-medium transition-colors ${
                  plan.current
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                disabled={plan.current}
              >
                {plan.current ? 'Current Plan' : 'Upgrade'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
