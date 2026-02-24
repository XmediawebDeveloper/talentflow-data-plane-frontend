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
  ChevronRight
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[95vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">
              Feature Dependency Matrix
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Visualize how features depend on each other
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 sm:p-1">
              <button
                onClick={() => setViewMode('tree')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'tree'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Tree
              </button>
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'matrix'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Matrix
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : viewMode === 'tree' ? (
            <div className="flex-1 overflow-auto p-3 sm:p-6">
              {/* Tree View */}
              <div className="space-y-4 sm:space-y-6">
                {/* Root features (no dependencies) */}
                <div>
                  <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-2 sm:mb-3">Base Features (No Dependencies)</h3>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {dependencyTree
                      .filter(n => n.dependencies.length === 0)
                      .map(node => (
                        <button
                          key={node.code}
                          onClick={() => setSelectedFeature(selectedFeature === node.code ? null : node.code)}
                          className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-xs sm:text-sm font-medium transition-colors ${
                            selectedFeature === node.code
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500 flex-shrink-0" />
                            <span className="truncate">{node.name}</span>
                            {node.dependents.length > 0 && (
                              <span className="text-[10px] sm:text-xs opacity-75 flex-shrink-0">
                                ({node.dependents.length})
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Dependent features */}
                <div>
                  <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-2 sm:mb-3">Features with Dependencies</h3>
                  <div className="space-y-3 sm:space-y-4">
                    {dependencyTree
                      .filter(n => n.dependencies.length > 0)
                      .map(node => (
                        <div
                          key={node.code}
                          className={`p-3 sm:p-4 rounded-lg border ${
                            selectedFeature === node.code
                              ? 'border-gray-900 bg-gray-50'
                              : 'border-gray-200'
                          }`}
                        >
                          <button
                            onClick={() => setSelectedFeature(selectedFeature === node.code ? null : node.code)}
                            className="w-full text-left"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                                <span className="font-medium text-gray-900 text-sm sm:text-base truncate">{node.name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-500 flex-shrink-0 pl-5 sm:pl-0">
                                <span>Requires: {node.dependencies.length}</span>
                                {node.dependents.length > 0 && (
                                  <span>Required by: {node.dependents.length}</span>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Dependencies */}
                          <div className="mt-2 sm:mt-3 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-[10px] sm:text-xs text-gray-500">Requires:</span>
                            {node.dependencies.map((dep, i) => (
                              <React.Fragment key={dep}>
                                <span
                                  className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded ${
                                    selectedFeature === dep
                                      ? 'bg-gray-900 text-white'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {matrix?.feature_names[dep] || dep}
                                </span>
                                {i < node.dependencies.length - 1 && (
                                  <span className="text-gray-400">+</span>
                                )}
                              </React.Fragment>
                            ))}
                            <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 mx-1 sm:mx-2 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-blue-100 text-blue-700">
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
              <div className="overflow-x-auto -mx-1">
                <table className="w-full border-collapse min-w-[400px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white p-1.5 sm:p-2 border border-gray-200 text-[10px] sm:text-xs font-medium text-gray-500">
                        Feature
                      </th>
                      {(matrix?.features || Object.keys(matrix?.feature_names || {})).map(code => (
                        <th
                          key={code}
                          className="p-1.5 sm:p-2 border border-gray-200 text-[10px] sm:text-xs font-medium text-gray-500 whitespace-nowrap"
                          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                        >
                          {(matrix?.feature_names || {})[code] || code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(matrix?.features || Object.keys(matrix?.feature_names || {})).map(rowCode => (
                      <tr key={rowCode}>
                        <td className="sticky left-0 bg-white p-1.5 sm:p-2 border border-gray-200 text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">
                          {(matrix?.feature_names || {})[rowCode] || rowCode}
                        </td>
                        {(matrix?.features || Object.keys(matrix?.feature_names || {})).map(colCode => {
                          const isDependency = ((matrix?.dependencies || {})[rowCode] || []).includes(colCode);
                          const isDependent = ((matrix?.reverse_dependencies || {})[rowCode] || []).includes(colCode);
                          const isSelf = rowCode === colCode;

                          return (
                            <td
                              key={colCode}
                              className={`p-1.5 sm:p-2 border border-gray-200 text-center ${
                                isSelf
                                  ? 'bg-gray-100'
                                  : isDependency
                                  ? 'bg-blue-100'
                                  : isDependent
                                  ? 'bg-green-100'
                                  : ''
                              }`}
                            >
                              {isSelf ? (
                                <span className="text-gray-400">-</span>
                              ) : isDependency ? (
                                <span title="Depends on">
                                  <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 mx-auto" />
                                </span>
                              ) : isDependent ? (
                                <span title="Required by">
                                  <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 mx-auto rotate-180" />
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-6 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-100 rounded flex-shrink-0"></div>
                  <span className="text-gray-600">Depends on (requires this feature)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-100 rounded flex-shrink-0"></div>
                  <span className="text-gray-600">Required by (this feature requires it)</span>
                </div>
              </div>
            </div>
          )}

          {/* Selected feature detail panel */}
          {selectedFeatureInfo && (
            <div className="w-full lg:w-72 xl:w-80 border-t lg:border-t-0 lg:border-l border-gray-200 p-3 sm:p-4 bg-gray-50 overflow-auto flex-shrink-0">
              <h3 className="font-medium text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">{selectedFeatureInfo.name}</h3>

              {selectedFeatureInfo.dependencies.length > 0 && (
                <div className="mb-3 sm:mb-4">
                  <h4 className="text-xs sm:text-sm font-medium text-gray-500 mb-1.5 sm:mb-2 flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                    Requires ({selectedFeatureInfo.dependencies.length})
                  </h4>
                  <ul className="space-y-1">
                    {selectedFeatureInfo.dependencies.map(dep => (
                      <li key={dep} className="text-xs sm:text-sm text-gray-700 pl-5 sm:pl-6">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-1.5 sm:p-2 bg-blue-50 border border-blue-100 rounded text-[10px] sm:text-xs text-blue-700">
                    <Info className="w-3 h-3 inline mr-1" />
                    These features must be enabled first
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependents.length > 0 && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-500 mb-1.5 sm:mb-2 flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 rotate-180 flex-shrink-0" />
                    Required by ({selectedFeatureInfo.dependents.length})
                  </h4>
                  <ul className="space-y-1">
                    {selectedFeatureInfo.dependents.map(dep => (
                      <li key={dep} className="text-xs sm:text-sm text-gray-700 pl-5 sm:pl-6">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-1.5 sm:p-2 bg-amber-50 border border-amber-100 rounded text-[10px] sm:text-xs text-amber-700">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Cannot be disabled while these are enabled
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependencies.length === 0 && selectedFeatureInfo.dependents.length === 0 && (
                <div className="p-2 sm:p-3 bg-gray-100 rounded text-xs sm:text-sm text-gray-600">
                  This feature has no dependencies and is not required by any other feature.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div className="text-xs sm:text-sm text-gray-500">
            {(matrix?.features || Object.keys(matrix?.feature_names || {})).length || 0} features, {Object.keys(matrix?.dependencies || {}).length} with dependencies
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium text-xs sm:text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
