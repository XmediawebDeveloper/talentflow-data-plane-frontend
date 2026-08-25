'use client';

/**
 * FeaturePermissionManager Component - RBAC06-07
 * Manages user-level feature permissions with dependency enforcement
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { IconComponent } from '@/lib/types/icon';
import {
  X,
  Loader2,
  Check,
  AlertTriangle,
  Lock,
  Unlock,
  Link2,
  Info,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  FileText,
  Briefcase,
  ClipboardCheck,
  BarChart3,
  Plug,
  Cog
} from 'lucide-react';
import { toast } from 'sonner';
import { featurePermissionService } from '@/lib/services/featurePermissionService';
import {
  FeatureFlags,
  FeatureMetadata,
  FEATURE_METADATA,
  PERMISSION_DEPENDENCIES,
  getFeatureDependencies,
  getDependentFeatures,
  isPermissionExpansionBlocked,
  UserRole
} from '@/lib/types/tenant';

interface FeaturePermissionManagerProps {
  userId: string;
  userName: string;
  userRole: UserRole;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

interface FeatureState {
  code: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  availableInPlan: boolean;
  locked: boolean;
  lockedReason?: string;
  dependencies: string[];
  dependents: string[];
}

// Category icons
const CATEGORY_ICONS: Record<string, IconComponent> = {
  'Resume Management': FileText,
  'AI Features': Zap,
  'Job Descriptions': Briefcase,
  'Assessment': ClipboardCheck,
  'Analytics': BarChart3,
  'Integration': Plug,
  'Operations': Cog,
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  'Resume Management': 'from-brand-blue to-brand-blue-2',
  'AI Features': 'from-brand-cyan to-brand-blue',
  'Job Descriptions': 'from-brand-orange to-brand-orange-deep',
  'Assessment': 'from-brand-blue to-brand-blue-2',
  'Analytics': 'from-brand-cyan to-brand-blue-2',
  'Integration': 'from-brand-orange to-brand-orange-deep',
  'Operations': 'from-brand-blue-2 to-brand-cyan',
};

export default function FeaturePermissionManager({
  userId,
  userName,
  userRole,
  isOpen,
  onClose,
  onUpdate
}: FeaturePermissionManagerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [features, setFeatures] = useState<FeatureState[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  const [autoEnableDeps, setAutoEnableDeps] = useState(true);

  // Check if user's role blocks permission expansion
  const isExpansionBlocked = isPermissionExpansionBlocked(userRole);

  // Load user features and available features
  useEffect(() => {
    if (isOpen) {
      loadFeatures();
    }
  }, [isOpen, userId]);

  const loadFeatures = async () => {
    setIsLoading(true);
    try {
      const [userFlags, availableFeatures] = await Promise.all([
        featurePermissionService.getUserFeatureFlags(userId),
        featurePermissionService.getAvailableFeatures()
      ]);

      // Safety check: Ensure all_features exists and is an array
      if (!availableFeatures || !Array.isArray(availableFeatures.all_features)) {
        console.error('Invalid response from getAvailableFeatures:', availableFeatures);
        toast.error('Failed to load features: Invalid data format');
        setFeatures([]);
        setIsLoading(false);
        return;
      }

      // Safety check: Ensure enabled_features exists and is an array
      if (!userFlags || !Array.isArray(userFlags.enabled_features)) {
        console.error('Invalid response from getUserFeatureFlags:', userFlags);
        toast.error('Failed to load user features: Invalid data format');
        setFeatures([]);
        setIsLoading(false);
        return;
      }

      const featureStates: FeatureState[] = availableFeatures.all_features.map(f => {
        const isEnabled = userFlags.enabled_features.includes(f.code);
        const deps = getFeatureDependencies(f.code);
        const dependents = getDependentFeatures(f.code);

        // Check if feature is locked (has enabled dependents)
        const enabledDependents = dependents.filter(d =>
          userFlags.enabled_features.includes(d)
        );
        const locked = enabledDependents.length > 0;

        return {
          code: f.code,
          name: f.name,
          description: f.description,
          category: f.category,
          enabled: isEnabled,
          availableInPlan: f.available_in_plan,
          locked,
          lockedReason: locked
            ? `Required by: ${enabledDependents.map(d => FEATURE_METADATA[d]?.name || d).join(', ')}`
            : undefined,
          dependencies: deps,
          dependents,
        };
      });

      setFeatures(featureStates);

      // Expand all categories by default
      const categories = [...new Set(featureStates.map(f => f.category))];
      setExpandedCategories(categories);
    } catch (error: any) {
      console.error('Error loading features:', error);
      toast.error(error.message || 'Failed to load features');
      setFeatures([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Group features by category
  const featuresByCategory = useMemo(() => {
    const groups: Record<string, FeatureState[]> = {};
    // Only include features that are available in the tenant's plan
    features.filter(f => f.availableInPlan).forEach(f => {
      if (!groups[f.category]) {
        groups[f.category] = [];
      }
      groups[f.category].push(f);
    });
    return groups;
  }, [features]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Handle feature toggle
  const handleFeatureToggle = async (featureCode: string, newValue: boolean) => {
    if (isExpansionBlocked) {
      toast.error('Permission expansion is blocked for this user role');
      return;
    }

    const feature = features.find(f => f.code === featureCode);
    if (!feature) return;

    // Can't toggle if feature is locked
    if (feature.locked && !newValue) {
      toast.error(feature.lockedReason || 'This feature cannot be disabled');
      return;
    }

    // Can't enable if not in plan
    if (!feature.availableInPlan && newValue) {
      toast.error('This feature is not available in your current plan');
      return;
    }

    // If enabling and has dependencies, check if auto-enable is on
    if (newValue && feature.dependencies.length > 0 && autoEnableDeps) {
      const missingDeps = feature.dependencies.filter(d =>
        !features.find(f => f.code === d)?.enabled &&
        !pendingChanges[d]
      );

      if (missingDeps.length > 0) {
        // Auto-enable dependencies
        const newChanges = { ...pendingChanges };
        missingDeps.forEach(d => {
          newChanges[d] = true;
        });
        newChanges[featureCode] = newValue;
        setPendingChanges(newChanges);

        toast.info(`Auto-enabling dependencies: ${missingDeps.map(d => FEATURE_METADATA[d]?.name || d).join(', ')}`);
        return;
      }
    }

    setPendingChanges(prev => ({
      ...prev,
      [featureCode]: newValue
    }));
  };

  // Check if feature is enabled (considering pending changes)
  const isFeatureEnabled = (code: string) => {
    if (pendingChanges[code] !== undefined) {
      return pendingChanges[code];
    }
    return features.find(f => f.code === code)?.enabled ?? false;
  };

  // Save changes
  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      // Build the final feature state
      const finalFeatures: Record<string, boolean> = {};
      features.forEach(f => {
        if (pendingChanges[f.code] !== undefined) {
          finalFeatures[f.code] = pendingChanges[f.code];
        } else {
          finalFeatures[f.code] = f.enabled;
        }
      });

      await featurePermissionService.bulkUpdateFeatureFlags(
        userId,
        finalFeatures,
        autoEnableDeps
      );

      toast.success('Feature permissions updated successfully');
      setPendingChanges({});
      onUpdate?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update features');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset changes
  const handleReset = () => {
    setPendingChanges({});
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-brand-blue/[0.04] via-white to-brand-cyan/[0.04] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-brand-blue flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/20 flex-shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                Feature Permissions
              </h2>
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="truncate">{userName}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ring-brand-blue/20 bg-brand-blue/10 text-brand-blue uppercase tracking-wider">
                  {userRole}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-brand-blue rounded-lg hover:bg-brand-blue/10 transition-colors flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/40">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 tf-loader-center tf-loader-center--compact">
              <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
            </div>
          ) : isExpansionBlocked ? (
            <div className="bg-gradient-to-br from-brand-orange/[0.06] to-brand-orange/[0.02] border border-brand-orange/30 rounded-xl p-5 shadow-sm">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-orange flex items-center justify-center shadow-sm flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Permission Expansion Blocked</h3>
                  <p className="text-sm text-gray-700 mt-1">
                    Users with the "{userRole}" role cannot have their permissions expanded.
                    This role is read-only by design.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Auto-enable dependencies toggle */}
              <div className="mb-6 flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center shadow-sm shadow-brand-cyan/20 flex-shrink-0">
                    <Link2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Auto-enable dependencies
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Automatically enable required features when enabling a dependent feature
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoEnableDeps(!autoEnableDeps)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ring-1 ${
                    autoEnableDeps
                      ? 'bg-brand-blue ring-brand-blue/30 shadow-sm shadow-brand-blue/25'
                      : 'bg-gray-200 ring-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      autoEnableDeps ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Features by category */}
              <div className="space-y-4">
                {Object.entries(featuresByCategory).map(([category, categoryFeatures]) => {
                  const CategoryIcon = CATEGORY_ICONS[category] || Shield;
                  const gradient = CATEGORY_GRADIENTS[category] || 'from-brand-blue to-brand-blue-2';
                  const isExpanded = expandedCategories.includes(category);
                  const enabledCount = categoryFeatures.filter(f => isFeatureEnabled(f.code)).length;

                  return (
                    <div key={category} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md hover:border-brand-blue/30 transition-all">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white hover:from-brand-blue/[0.04] hover:to-brand-cyan/[0.03] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm ring-1 ring-white/20`}>
                            <CategoryIcon className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-semibold text-gray-900">{category}</span>
                          <span className="text-xs font-medium text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 px-2 py-0.5 rounded-full">
                            {enabledCount} / {categoryFeatures.length}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-brand-blue" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="divide-y divide-gray-100">
                          {categoryFeatures.map(feature => {
                            const isEnabled = isFeatureEnabled(feature.code);
                            const hasChange = pendingChanges[feature.code] !== undefined;
                            const isDisabled = feature.locked;

                            return (
                              <div
                                key={feature.code}
                                className={`px-4 py-3 flex items-center justify-between transition-colors ${
                                  hasChange
                                    ? 'bg-brand-blue/[0.06] ring-1 ring-inset ring-brand-blue/20'
                                    : 'hover:bg-brand-blue/[0.03]'
                                } ${isDisabled ? 'opacity-60' : ''}`}
                              >
                                <div className="flex-1 pr-4">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-900">
                                      {feature.name}
                                    </span>
                                    {feature.locked && (
                                      <span
                                        title={feature.lockedReason}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ring-brand-orange/30 bg-brand-orange/10 text-brand-orange-deep"
                                      >
                                        <Lock className="w-3 h-3" /> Locked
                                      </span>
                                    )}
                                    {feature.dependencies.length > 0 && (
                                      <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ring-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan"
                                        title={`Requires: ${feature.dependencies.join(', ')}`}
                                      >
                                        <Link2 className="w-3 h-3" /> {feature.dependencies.length}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-500 mt-0.5">
                                    {feature.description}
                                  </p>
                                </div>

                                <button
                                  onClick={() => handleFeatureToggle(feature.code, !isEnabled)}
                                  disabled={isDisabled}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ring-1 ${
                                    isEnabled
                                      ? 'bg-brand-blue ring-brand-blue/30 shadow-sm shadow-brand-blue/25'
                                      : 'bg-gray-200 ring-gray-300'
                                  } ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                      isEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Changes summary */}
              {hasChanges && (
                <div className="mt-6 bg-gradient-to-r from-brand-blue/[0.08] to-brand-cyan/[0.05] border border-brand-blue/20 ring-1 ring-brand-blue/10 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 flex-shrink-0">
                        <Info className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-semibold text-brand-blue">
                        {Object.keys(pendingChanges).length} change(s) pending
                      </span>
                    </div>
                    <button
                      onClick={handleReset}
                      className="text-sm font-medium text-brand-blue hover:text-brand-blue-2 px-3 py-1.5 rounded-lg hover:bg-white/60 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-brand-blue hover:bg-brand-blue/[0.06] rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isExpansionBlocked}
            className="px-4 py-2 bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
