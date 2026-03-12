'use client';

import React, { useState, useCallback } from 'react';
import { Video, Mic, Eye, Shield, Clock, Trash2, CheckCircle, AlertTriangle, Circle } from 'lucide-react';

interface StepConsentProps {
  onAccept: (consents: {
    consent_video: boolean;
    consent_audio: boolean;
    consent_biometric: boolean;
    consent_ai_analysis: boolean;
    consent_terms: boolean;
  }) => void;
  submitting?: boolean;
}

type ConsentKey =
  | 'consent_video'
  | 'consent_audio'
  | 'consent_biometric'
  | 'consent_ai_analysis'
  | 'consent_terms';

interface ConsentState {
  consent_video: boolean;
  consent_audio: boolean;
  consent_biometric: boolean;
  consent_ai_analysis: boolean;
  consent_terms: boolean;
}

const CONSENT_ITEMS: { key: ConsentKey; label: string }[] = [
  { key: 'consent_video', label: 'I consent to video recording during this interview' },
  { key: 'consent_audio', label: 'I consent to audio recording and transcription' },
  { key: 'consent_biometric', label: 'I consent to biometric data processing (GDPR Art. 9)' },
  { key: 'consent_ai_analysis', label: 'I consent to AI-powered analysis of my responses' },
  { key: 'consent_terms', label: 'I have read and agree to the Privacy Policy and Terms of Service' },
];

const DATA_CARDS = [
  {
    icon: Video,
    title: 'Video Recording',
    description: 'Your video will be recorded throughout the interview',
    color: 'from-purple-500 to-blue-500',
    bg: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
  {
    icon: Mic,
    title: 'Audio Recording',
    description: 'Your audio will be captured for transcription and analysis',
    color: 'from-blue-500 to-teal-500',
    bg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    icon: Eye,
    title: 'Facial Analysis',
    description: 'AI will analyze facial expressions for engagement metrics',
    color: 'from-teal-500 to-green-500',
    bg: 'bg-teal-50',
    iconColor: 'text-teal-600',
  },
];

const GDPR_RIGHTS = [
  'Right to access your personal data',
  'Right to rectification of inaccurate data',
  'Right to erasure ("right to be forgotten")',
  'Right to restrict processing',
  'Right to data portability',
  'Right to object to processing',
  'Right to withdraw consent at any time',
  'Right to lodge a complaint with a supervisory authority',
];

export default function StepConsent({ onAccept, submitting = false }: StepConsentProps) {
  const [consents, setConsents] = useState<ConsentState>({
    consent_video: false,
    consent_audio: false,
    consent_biometric: false,
    consent_ai_analysis: false,
    consent_terms: false,
  });

  const allChecked = Object.values(consents).every(Boolean);
  const noneChecked = Object.values(consents).every((v) => !v);

  const toggleConsent = useCallback((key: ConsentKey) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAll = useCallback(() => {
    const newValue = !allChecked;
    setConsents({
      consent_video: newValue,
      consent_audio: newValue,
      consent_biometric: newValue,
      consent_ai_analysis: newValue,
      consent_terms: newValue,
    });
  }, [allChecked]);

  const handleSubmit = useCallback(() => {
    if (allChecked && !submitting) {
      onAccept(consents);
    }
  }, [allChecked, submitting, consents, onAccept]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Step Indicator */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full">
          <Shield className="w-3.5 h-3.5" />
          Privacy &amp; Consent
        </span>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mt-3">
          Consent &amp; Data Privacy
        </h1>
        <p className="text-gray-500 mt-2">
          Please review the following information before proceeding with your interview.
        </p>
      </div>

      {/* 1. GDPR/DPDP Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Important Notice — Biometric Data Collection
            </h2>
            <p className="text-gray-600 mt-2 text-sm leading-relaxed">
              In accordance with the General Data Protection Regulation (GDPR) Article 9 and the
              Digital Personal Data Protection Act (DPDP), we are required to obtain your explicit
              consent before collecting and processing biometric data. This interview process
              involves the collection of video, audio, and facial expression data which constitutes
              special category data under GDPR. Your explicit consent is required before we can
              proceed. You may withdraw your consent at any time.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Data Collection During Interview */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Data Collection During Interview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {DATA_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center text-center hover:shadow-md transition-shadow"
              >
                <div className={`w-10 h-10 rounded-full ${card.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Data Retention & Deletion */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Data Retention &amp; Deletion</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              All collected data will be retained for a period of <strong className="text-gray-900">90 days</strong> from the date of your interview.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Trash2 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              After the retention period, all personal and biometric data will be <strong className="text-gray-900">automatically and permanently deleted</strong> from our systems.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              You have the <strong className="text-gray-900">right to request early deletion</strong> of your data at any time by contacting our data protection team.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Consent Checkboxes */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Consent</h2>
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm font-medium text-purple-600 hover:text-purple-700 underline underline-offset-2 transition-colors"
          >
            {allChecked ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div className="space-y-3">
          {CONSENT_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={consents[item.key]}
                onChange={() => toggleConsent(item.key)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors select-none">
                {item.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 5. Your Rights */}
      <div className="bg-green-50/50 border border-green-100 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Rights</h2>
        <p className="text-sm text-gray-600 mb-3">
          Under GDPR and applicable data protection laws, you have the following rights:
        </p>
        <ul className="space-y-2">
          {GDPR_RIGHTS.map((right) => (
            <li key={right} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-gray-600">{right}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 6. Recording Indicator Notice */}
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
        <Circle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <p className="text-sm text-gray-700">
          A <span className="font-medium text-red-600">recording indicator</span> will be visible throughout the interview.
        </p>
      </div>

      {/* Accept Button */}
      <div className="pt-2 pb-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allChecked || submitting}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-md shadow-purple-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {submitting ? 'Submitting...' : 'Accept All & Continue'}
        </button>
        {!allChecked && !noneChecked && (
          <p className="text-xs text-gray-500 text-center mt-2">
            Please check all consent boxes above to continue.
          </p>
        )}
      </div>
    </div>
  );
}
