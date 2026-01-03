'use client';

/**
 * UnitValidationAlert Component - UN02
 * Displays validation warnings and blocks before unit-consuming operations
 */

import React from 'react';
import { AlertTriangle, XCircle, Info, CheckCircle } from 'lucide-react';

export interface ValidationAlertProps {
  isVisible: boolean;
  valid: boolean;
  unitType?: string;
  unitName?: string;
  unitsAvailable?: number;
  unitsRequired?: number;
  error?: string;
  message?: string;
  actionRequired?: string;
  onDismiss?: () => void;
}

export default function UnitValidationAlert({
  isVisible,
  valid,
  unitType,
  unitName,
  unitsAvailable = 0,
  unitsRequired = 1,
  error,
  message,
  actionRequired,
  onDismiss,
}: ValidationAlertProps) {
  if (!isVisible) return null;

  // Determine alert style based on validation result
  const styles = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: CheckCircle,
      iconColor: 'text-green-600',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: XCircle,
      iconColor: 'text-red-600',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: Info,
      iconColor: 'text-blue-600',
    },
  };

  let style = styles.info;
  if (valid) {
    style = styles.success;
  } else if (error === 'INSUFFICIENT_UNITS') {
    style = styles.warning;
  } else if (error === 'TENANT_SUSPENDED' || error === 'TENANT_EXPIRED') {
    style = styles.error;
  }

  const Icon = style.icon;

  return (
    <div className={`p-4 rounded-lg border ${style.bg} ${style.border} mb-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.iconColor}`} />
        <div className="flex-1">
          {/* Title */}
          <div className="flex items-center justify-between">
            <h4 className={`font-medium ${style.text}`}>
              {valid ? '✓ Validation Passed' : error || 'Validation Failed'}
            </h4>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className={`text-gray-400 hover:text-gray-600`}
              >
                <span className="sr-only">Dismiss</span>
                ×
              </button>
            )}
          </div>

          {/* Message */}
          {message && (
            <p className={`text-sm mt-1 ${style.text}`}>
              {message}
            </p>
          )}

          {/* Unit Details */}
          {!valid && unitName && (
            <div className="mt-2 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className={style.text}>Unit Type:</span>
                <span className={`font-medium ${style.text}`}>{unitName} ({unitType})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={style.text}>Available:</span>
                <span className={`font-medium ${style.text}`}>{unitsAvailable}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={style.text}>Required:</span>
                <span className={`font-medium ${style.text}`}>{unitsRequired}</span>
              </div>
              {unitsRequired > unitsAvailable && (
                <div className="flex items-center justify-between">
                  <span className={style.text}>Shortfall:</span>
                  <span className={`font-bold ${style.text}`}>
                    {unitsRequired - unitsAvailable} units needed
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action Required */}
          {!valid && actionRequired && (
            <div className={`mt-3 p-2 rounded ${style.bg} border ${style.border}`}>
              <p className={`text-sm font-medium ${style.text}`}>
                Action Required:
              </p>
              <p className={`text-sm mt-1 ${style.text}`}>
                {actionRequired}
              </p>
            </div>
          )}

          {/* Success Message for Available Units */}
          {valid && (
            <div className="mt-2 text-sm">
              <p className={style.text}>
                You have <span className="font-medium">{unitsAvailable}</span> {unitName} units available.
                This operation will consume <span className="font-medium">{unitsRequired}</span> unit(s).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
