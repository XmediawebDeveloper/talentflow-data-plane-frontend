'use client';

/**
 * DependencyMatrix Component - RBAC07
 * Visualizes feature permission dependencies
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
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
import { toast } from 'sonner';
import { featurePermissionService, DependencyMatrixResponse } from '@/lib/services/featurePermissionService';
import { FEATURE_METADATA, PERMISSION_DEPENDENCIES } from '@/lib/types/tenant';

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
  const [viewMode, setViewMode] = useState<'matrix' | 'tree'>('tree');

  useEffect(() => {
    if (isOpen) {
      loadMatrix();
    }
  }, [isOpen]);

  const loadMatrix = async () => {
    setIsLoading(true);
    try {
      const data = await featurePermissionService.getDependencyMatrix();
      setMatrix(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load dependency matrix');
    } finally {
      setIsLoading(false);
    }
  };

  // Build dependency tree
  const dependencyTree = useMemo(() => {
    if (!matrix) return [];

    // Get features array - fallback to keys from feature_names or dependencies if not provided
    const features = matrix.features ||
      Object.keys(matrix.feature_names || {}) ||
      Object.keys(matrix.dependencies || {}) ||
      [];

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
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-gradient-to-r from-brand-cyan/[0.05] via-white to-brand-blue/[0.04] flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center shadow-md shadow-brand-cyan/25 ring-1 ring-white/20 flex-shrink-0">
              <Network className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                Feature Dependency Matrix
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                Visualize how features depend on each other
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 sm:p-1 ring-1 ring-gray-200">
              <button
                onClick={() => setViewMode('tree')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  viewMode === 'tree'
                    ? 'bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white shadow-sm shadow-brand-blue/25'
                    : 'text-gray-600 hover:text-brand-blue'
                }`}
              >
                Tree
              </button>
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${
                  viewMode === 'matrix'
                    ? 'bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white shadow-sm shadow-brand-blue/25'
                    : 'text-gray-600 hover:text-brand-blue'
                }`}
              >
                Matrix
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-gray-400 hover:text-brand-blue rounded-lg hover:bg-brand-blue/10 transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row bg-gray-50/40">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
            </div>
          ) : viewMode === 'tree' ? (
            <div className="flex-1 overflow-auto p-3 sm:p-6">
              {/* Tree View */}
              <div className="space-y-4 sm:space-y-6">
                {/* Root features (no dependencies) */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-sm">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                    Base Features (No Dependencies)
                  </h3>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {dependencyTree
                      .filter(n => n.dependencies.length === 0)
                      .map(node => (
                        <button
                          key={node.code}
                          onClick={() => setSelectedFeature(selectedFeature === node.code ? null : node.code)}
                          className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium transition-all ${
                            selectedFeature === node.code
                              ? 'bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white border-brand-blue shadow-sm shadow-brand-blue/25'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/[0.04] hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <CheckCircle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${selectedFeature === node.code ? 'text-white' : 'text-emerald-500'}`} />
                            <span className="truncate">{node.name}</span>
                            {node.dependents.length > 0 && (
                              <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full ring-1 flex-shrink-0 ${
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

                {/* Dependent features */}
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center shadow-sm">
                      <GitBranch className="w-4 h-4 text-white" />
                    </div>
                    Features with Dependencies
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
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-blue/10 to-brand-cyan/10 ring-1 ring-brand-blue/20 flex items-center justify-center flex-shrink-0">
                                  <Link2 className="w-3.5 h-3.5 text-brand-blue" />
                                </div>
                                <span className="font-semibold text-gray-900 text-sm sm:text-base truncate">{node.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs flex-shrink-0 pl-9 sm:pl-0">
                                <span className="px-2 py-0.5 rounded-full ring-1 ring-brand-blue/20 bg-brand-blue/10 text-brand-blue font-medium">
                                  Requires {node.dependencies.length}
                                </span>
                                {node.dependents.length > 0 && (
                                  <span className="px-2 py-0.5 rounded-full ring-1 ring-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan font-medium">
                                    Required by {node.dependents.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Dependencies */}
                          <div className="mt-3 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">Requires:</span>
                            {node.dependencies.map((dep, i) => (
                              <React.Fragment key={dep}>
                                <span
                                  className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full font-medium ring-1 ${
                                    selectedFeature === dep
                                      ? 'bg-gradient-to-r from-brand-blue to-brand-blue-2 text-white ring-brand-blue/40 shadow-sm'
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
                            <span className="text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full font-medium ring-1 ring-brand-blue/30 bg-brand-blue/10 text-brand-blue">
                              {node.name}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-3 sm:p-6">
              {/* Matrix View */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[400px]">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="sticky left-0 bg-gray-50 p-2 sm:p-3 border-b border-r border-gray-200 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider text-left">
                          Feature
                        </th>
                        {(matrix?.features || Object.keys(matrix?.feature_names || {})).map(code => (
                          <th
                            key={code}
                            className="p-2 sm:p-3 border-b border-gray-200 text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                          >
                            {(matrix?.feature_names || {})[code] || code}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(matrix?.features || Object.keys(matrix?.feature_names || {})).map(rowCode => {
                        const isRowSelected = selectedFeature === rowCode;
                        return (
                          <tr
                            key={rowCode}
                            className={`transition-colors ${
                              isRowSelected
                                ? 'bg-brand-blue/5 ring-1 ring-brand-blue/20'
                                : 'hover:bg-brand-blue/[0.02]'
                            }`}
                          >
                            <td className={`sticky left-0 p-2 sm:p-3 border-r border-gray-200 text-xs sm:text-sm font-medium whitespace-nowrap ${
                              isRowSelected ? 'bg-brand-blue/5 text-brand-blue' : 'bg-white text-gray-700'
                            }`}>
                              <button
                                onClick={() => setSelectedFeature(isRowSelected ? null : rowCode)}
                                className="text-left hover:text-brand-blue transition-colors"
                              >
                                {(matrix?.feature_names || {})[rowCode] || rowCode}
                              </button>
                            </td>
                            {(matrix?.features || Object.keys(matrix?.feature_names || {})).map(colCode => {
                              const isDependency = ((matrix?.dependencies || {})[rowCode] || []).includes(colCode);
                              const isDependent = ((matrix?.reverse_dependencies || {})[rowCode] || []).includes(colCode);
                              const isSelf = rowCode === colCode;

                              return (
                                <td
                                  key={colCode}
                                  className={`p-2 sm:p-3 text-center ${
                                    isSelf
                                      ? 'bg-gray-100'
                                      : isDependency
                                      ? 'bg-brand-blue/10'
                                      : isDependent
                                      ? 'bg-emerald-50'
                                      : ''
                                  }`}
                                >
                                  {isSelf ? (
                                    <span className="text-gray-400">—</span>
                                  ) : isDependency ? (
                                    <span title="Depends on">
                                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-blue mx-auto" />
                                    </span>
                                  ) : isDependent ? (
                                    <span title="Required by">
                                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 mx-auto rotate-180" />
                                    </span>
                                  ) : (
                                    <span className="text-gray-200">·</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-brand-blue/30 bg-brand-blue/10 text-brand-blue inline-flex items-center gap-1.5">
                  <ArrowRight className="w-3 h-3" /> Depends on
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-emerald-300 bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5">
                  <ArrowRight className="w-3 h-3 rotate-180" /> Required by
                </span>
              </div>
            </div>
          )}

          {/* Selected feature detail panel */}
          {selectedFeatureInfo && (
            <div className="w-full lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-gray-200 p-3 sm:p-4 bg-gradient-to-b from-brand-blue/[0.03] to-white overflow-auto flex-shrink-0">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-blue-2 flex items-center justify-center shadow-sm shadow-brand-blue/25 flex-shrink-0">
                  <Layers className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{selectedFeatureInfo.name}</h3>
              </div>

              {selectedFeatureInfo.dependencies.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ring-brand-blue/30 bg-brand-blue/10 text-brand-blue inline-flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" /> Requires {selectedFeatureInfo.dependencies.length}
                    </span>
                  </h4>
                  <ul className="space-y-1.5">
                    {selectedFeatureInfo.dependencies.map(dep => (
                      <li key={dep} className="text-xs sm:text-sm text-gray-700 pl-3 py-1.5 px-2 rounded-md bg-white border border-gray-200 hover:border-brand-blue/30 hover:bg-brand-blue/[0.03] transition-colors">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-2 bg-brand-blue/[0.06] border border-brand-blue/20 ring-1 ring-brand-blue/10 rounded-lg text-[10px] sm:text-xs text-brand-blue flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>These features must be enabled first</span>
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependents.length > 0 && (
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ring-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan inline-flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 rotate-180" /> Required by {selectedFeatureInfo.dependents.length}
                    </span>
                  </h4>
                  <ul className="space-y-1.5">
                    {selectedFeatureInfo.dependents.map(dep => (
                      <li key={dep} className="text-xs sm:text-sm text-gray-700 pl-3 py-1.5 px-2 rounded-md bg-white border border-gray-200 hover:border-brand-cyan/30 hover:bg-brand-cyan/[0.03] transition-colors">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-2 bg-brand-orange/[0.06] border border-brand-orange/20 ring-1 ring-brand-orange/10 rounded-lg text-[10px] sm:text-xs text-brand-orange-deep flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>Cannot be disabled while these are enabled</span>
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependencies.length === 0 && selectedFeatureInfo.dependents.length === 0 && (
                <div className="p-3 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-600 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>This feature has no dependencies and is not required by any other feature.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div className="text-xs sm:text-sm text-gray-600 flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-brand-blue/20 bg-brand-blue/10 text-brand-blue">
              {(matrix?.features || Object.keys(matrix?.feature_names || {})).length || 0} features
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan">
              {Object.keys(matrix?.dependencies || {}).length} with dependencies
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-brand-blue to-brand-blue-2 hover:from-brand-blue-2 hover:to-brand-blue text-white rounded-lg text-xs sm:text-sm font-medium shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
