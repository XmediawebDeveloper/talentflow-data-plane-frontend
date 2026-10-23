'use client';

/**
 * DependencyMatrix Component - RBAC07
 * Visualizes feature permission dependencies
 */

import { getCatalogDependencyMatrix, ENTRY_POINT_GROUPS, getPermissionLabel, getPermissionParts } from '@/lib/constants/permissionCategories';
import { getAllCatalogCodes, getCrossSectionDependents } from '@/lib/permissions/permissionRules';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  ArrowRight,
  Link2,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Network,
  Layers,
  GitBranch
} from 'lucide-react';
import type { DependencyMatrixResponse } from '@/lib/services/featurePermissionService';
import { FEATURE_METADATA, PERMISSION_DEPENDENCIES } from '@/lib/types/tenant';
import AppModal from '@/components/ui/app-modal';
import { Badge } from '@/components/ui/badge';

interface DependencyMatrixProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DependencyNode {
  code: string;
  name: string;
  dependencies: string[];
  dependents: string[];
  level: number;
}

export default function DependencyMatrix({ isOpen, onClose }: DependencyMatrixProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [matrix, setMatrix] = useState<DependencyMatrixResponse | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadMatrix();
    }
  }, [isOpen]);

  // The real rules — the same ones the Edit User / Edit Role screens apply and
  // the server enforces (lib/constants/permissionCategories.ts). The server's
  // /tenant-admin/dependencies/matrix feature list was an older, different rule
  // set (e.g. "Assessment needs Shared Database"), so it is no longer shown here.
  const loadMatrix = async () => {
    setIsLoading(true);
    setMatrix(getCatalogDependencyMatrix());
    setIsLoading(false);
  };

  // Build dependency tree
  const dependencyTree = useMemo(() => {
    if (!matrix) return [];

    // Get features array - fallback to keys from feature_names or dependencies if not provided
    // `||` never fell through before: an empty array is truthy, so an empty
    // `features` list blocked every fallback. Pick the first non-empty source.
    const features = [
      matrix.features,
      Object.keys(matrix.feature_names || {}),
      Object.keys(matrix.dependencies || {}),
    ].find((list) => Array.isArray(list) && list.length > 0) || [];

    if (!features || features.length === 0) return [];

    const nodes: DependencyNode[] = features.map(code => ({
      code,
      name: (matrix.feature_names || {})[code] || code,
      dependencies: (matrix.dependencies || {})[code] || [],
      dependents: (matrix.reverse_dependencies || {})[code] || [],
      level: 0,
    }));

    // Calculate levels based on dependencies
    const calculateLevel = (code: string, visited: Set<string> = new Set()): number => {
      if (visited.has(code)) return 0;
      visited.add(code);

      const deps = (matrix.dependencies || {})[code] || [];
      if (deps.length === 0) return 0;

      const maxDepLevel = Math.max(...deps.map(d => calculateLevel(d, visited)));
      return maxDepLevel + 1;
    };

    nodes.forEach(node => {
      node.level = calculateLevel(node.code);
    });

    // Sort by level (root features first)
    return nodes.sort((a, b) => a.level - b.level);
  }, [matrix]);

  // Permissions whole other sections depend on (View Job Description → Resume
  // Scoring, AI Talent Match, Assessment, AI Interview…), from the same rules the
  // Edit User / role screens apply — so this list always matches what happens.
  const sectionRules = useMemo(() =>
    getAllCatalogCodes()
      .map(code => {
        const deps = getCrossSectionDependents(code);
        if (deps.length === 0) return null;
        const bySection = new Map<string, number>();
        deps.forEach(d => {
          const { section } = getPermissionParts(d);
          bySection.set(section, (bySection.get(section) || 0) + 1);
        });
        return { code, total: deps.length, sections: Array.from(bySection.entries()) };
      })
      .filter((r): r is { code: string; total: number; sections: [string, number][] } => !!r)
      .sort((a, b) => b.total - a.total),
  []);

  // Get selected feature info
  const selectedFeatureInfo = useMemo(() => {
    if (!selectedFeature || !matrix) return null;

    return {
      code: selectedFeature,
      name: matrix.feature_names[selectedFeature] || selectedFeature,
      dependencies: matrix.dependencies[selectedFeature] || [],
      dependents: matrix.reverse_dependencies[selectedFeature] || [],
    };
  }, [selectedFeature, matrix]);

  if (!isOpen) return null;

  return (
    <AppModal
      open
      size="lg"
      mobileSheet
      zIndexClass="z-50"
      onCancel={onClose}
      icon={<Network />}
      title="Permission Dependencies"
      subtitle="Which permissions need other permissions to work"
      bodyClassName="!p-0 sm:!p-0 flex flex-col"
      footerStart={
          <div className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
            <Badge variant="info">
              {(matrix?.features || Object.keys(matrix?.feature_names || {})).length || 0} permissions
            </Badge>
            <Badge variant="secondary">
              {Object.keys(matrix?.dependencies || {}).length} need others
            </Badge>
          </div>
      }
    >
        {/* Content */}
        <div className="flex-1 min-h-[50dvh] overflow-hidden flex flex-col lg:flex-row bg-gray-50/40">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-3 sm:p-6">
              {/* Tree View */}
              <div className="space-y-4 sm:space-y-6">
                <div className="rounded-xl border border-brand-blue/15 bg-brand-blue/[0.04] p-3 sm:p-4 text-sm max-sm:text-[13px] text-gray-700 flex items-start gap-2">
                  <Info className="w-4 h-4 text-brand-blue flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-gray-900">How it works</p>
                    <p>Some permissions only work together with others. When you give someone a permission, everything it needs is <strong>switched on for them automatically</strong>.</p>
                    <p>If you remove a permission that others need, you&apos;ll be <strong>asked to confirm</strong> — and the permissions that need it are removed too.</p>
                    <p>Turning such a permission back on asks what to bring back: <strong>Only this</strong>, <strong>Restore previous</strong> (exactly what was on before, while the screen is still open) or <strong>Turn on all</strong>.</p>
                    <p className="text-gray-500">Click any permission to see what it needs and what needs it.</p>
                  </div>
                </div>

                {/* Whole sections that need another permission */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
                  <h3 className="text-base max-sm:text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-destructive/90 flex items-center justify-center shadow-sm">
                      <AlertTriangle className="w-4 h-4 text-white" />
                    </div>
                    Turning these off turns off other sections
                  </h3>
                  <p className="mb-3 text-xs text-gray-500">
                    The number is how many permissions in that section stop working. Turning it back on offers Only this / Restore previous / Turn on all.
                  </p>
                  <div className="space-y-2.5">
                    {sectionRules.map(rule => (
                      <div key={rule.code} className="flex items-start gap-2 flex-wrap text-sm max-sm:text-[13px]">
                        <button type="button" onClick={() => setSelectedFeature(selectedFeature === rule.code ? null : rule.code)}>
                          <Badge variant="info" className="text-xs">{getPermissionLabel(rule.code)}</Badge>
                        </button>
                        <span className="mt-0.5 text-xs text-gray-500">off →</span>
                        <div className="flex flex-wrap gap-1.5">
                          {rule.sections.map(([section, count]) => (
                            <span key={section} className="text-xs px-2 py-0.5 rounded-full font-medium ring-1 bg-gray-50 text-gray-700 ring-gray-200">
                              {section} ({count})
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Root features (no dependencies) */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
                  <h3 className="text-base max-sm:text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-success flex items-center justify-center shadow-sm">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                    Permissions that work on their own
                  </h3>
                  <p className="-mt-1 mb-3 text-xs text-gray-500">The number shows how many other permissions need it.</p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {dependencyTree
                      .filter(n => n.dependencies.length === 0)
                      .map(node => (
                        <button
                          key={node.code}
                          onClick={() => setSelectedFeature(selectedFeature === node.code ? null : node.code)}
                          className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-sm font-medium transition-all ${
                            selectedFeature === node.code
                              ? 'bg-brand-blue text-white border-brand-blue shadow-sm shadow-brand-blue/25'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/[0.04] hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <CheckCircle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${selectedFeature === node.code ? 'text-white' : 'text-success'}`} />
                            <span className="truncate">{node.name}</span>
                            {node.dependents.length > 0 && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ring-1 flex-shrink-0 ${
                                selectedFeature === node.code
                                  ? 'bg-white/20 text-white ring-white/30'
                                  : 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/30'
                              }`}>
                                {node.dependents.length}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Main permission → entry points in other sections */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
                  <h3 className="text-base max-sm:text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-brand-orange/90 flex items-center justify-center shadow-sm">
                      <ArrowRight className="w-4 h-4 text-white" />
                    </div>
                    Can also be started from other sections
                  </h3>
                  <p className="mb-3 text-xs text-gray-500">
                    An entry point only works while its main permission is on. Turning the main permission on offers to turn these on too; turning it off turns them off.
                  </p>
                  <div className="space-y-2.5">
                    {ENTRY_POINT_GROUPS.map(group => (
                      <div key={group.main} className="flex items-start gap-2 flex-wrap text-sm max-sm:text-[13px]">
                        <Badge variant="info" className="text-xs">{getPermissionLabel(group.main)}</Badge>
                        <ArrowRight className="w-3.5 h-3.5 text-brand-cyan mt-1 flex-shrink-0" />
                        <div className="flex flex-wrap gap-1.5">
                          {group.entries.map(entry => (
                            <span key={entry} className="text-xs px-2 py-0.5 rounded-full font-medium ring-1 bg-gray-50 text-gray-700 ring-gray-200">
                              {getPermissionLabel(entry)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dependent features */}
                <div>
                  <h3 className="text-base max-sm:text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center shadow-sm">
                      <GitBranch className="w-4 h-4 text-white" />
                    </div>
                    Permissions that need others
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    {dependencyTree
                      .filter(n => n.dependencies.length > 0)
                      .map(node => (
                        <div
                          key={node.code}
                          className={`p-3 sm:p-4 rounded-xl border bg-white shadow-sm transition-all ${
                            selectedFeature === node.code
                              ? 'border-brand-blue/40 bg-brand-blue/[0.04] ring-1 ring-brand-blue/20 shadow-md'
                              : 'border-gray-200 hover:border-brand-blue/30 hover:shadow-md'
                          }`}
                        >
                          <button
                            onClick={() => setSelectedFeature(selectedFeature === node.code ? null : node.code)}
                            className="w-full text-left"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-brand-blue/10 ring-1 ring-brand-blue/20 flex items-center justify-center flex-shrink-0">
                                  <Link2 className="w-3.5 h-3.5 text-brand-blue" />
                                </div>
                                <span className="font-semibold text-gray-900 text-base max-sm:text-sm truncate">{node.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs flex-shrink-0 pl-9 sm:pl-0">
                                <span className="px-2 py-0.5 rounded-full ring-1 ring-brand-blue/20 bg-brand-blue/10 text-brand-blue font-medium">
                                  Needs {node.dependencies.length}
                                </span>
                                {node.dependents.length > 0 && (
                                  <span className="px-2 py-0.5 rounded-full ring-1 ring-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan font-medium">
                                    Needed by {node.dependents.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Dependencies */}
                          <div className="mt-3 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Needs:</span>
                            {node.dependencies.map((dep, i) => (
                              <React.Fragment key={dep}>
                                <span
                                  className={`text-xs px-2 py-0.5 sm:py-1 rounded-full font-medium ring-1 ${
                                    selectedFeature === dep
                                      ? 'bg-brand-blue text-white ring-brand-blue/40 shadow-sm'
                                      : 'bg-gray-50 text-gray-700 ring-gray-200'
                                  }`}
                                >
                                  {matrix?.feature_names[dep] || dep}
                                </span>
                                {i < node.dependencies.length - 1 && (
                                  <span className="text-brand-cyan font-semibold">+</span>
                                )}
                              </React.Fragment>
                            ))}
                            <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-cyan mx-1 flex-shrink-0" />
                            <Badge variant="info" className="text-xs">
                              {node.name}
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Selected feature detail panel */}
          {selectedFeatureInfo && (
            <div className="w-full lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-gray-200 p-3 sm:p-4 bg-gradient-to-b from-brand-blue/[0.03] to-white overflow-auto flex-shrink-0">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-blue flex items-center justify-center shadow-sm shadow-brand-blue/25 flex-shrink-0">
                  <Layers className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900 text-base max-sm:text-sm truncate">{selectedFeatureInfo.name}</h3>
              </div>

              {selectedFeatureInfo.dependencies.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-base max-sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Badge variant="info" className="text-xs">
                      <ArrowRight className="w-3 h-3" /> Needs {selectedFeatureInfo.dependencies.length}
                    </Badge>
                  </h4>
                  <ul className="space-y-1.5">
                    {selectedFeatureInfo.dependencies.map(dep => (
                      <li key={dep} className="text-sm max-sm:text-[13px] text-gray-700 pl-3 py-1.5 px-2 rounded-md bg-white border border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03] transition-colors">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-2 bg-brand-blue/[0.06] border border-brand-blue/20 ring-1 ring-brand-blue/10 rounded-lg text-xs text-brand-blue flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>These are switched on automatically when you give this permission.</span>
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependents.length > 0 && (
                <div>
                  <h4 className="text-base max-sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      <ArrowRight className="w-3 h-3 rotate-180" /> Needed by {selectedFeatureInfo.dependents.length}
                    </Badge>
                  </h4>
                  <ul className="space-y-1.5">
                    {selectedFeatureInfo.dependents.map(dep => (
                      <li key={dep} className="text-sm max-sm:text-[13px] text-gray-700 pl-3 py-1.5 px-2 rounded-md bg-white border border-gray-200 hover:border-brand-cyan/30 hover:bg-brand-cyan/[0.03] transition-colors">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-2 bg-brand-orange/[0.06] border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-lg text-xs text-brand-orange-deep flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>Removing this permission will also remove these (you&apos;ll be asked to confirm first).</span>
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependencies.length === 0 && selectedFeatureInfo.dependents.length === 0 && (
                <div className="p-3 bg-white border border-gray-200 rounded-lg text-sm max-sm:text-[13px] text-gray-600 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  <span>This permission works on its own, and no other permission needs it.</span>
                </div>
              )}
            </div>
          )}
        </div>

    </AppModal>
  );
}
