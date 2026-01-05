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

    const nodes: DependencyNode[] = matrix.features.map(code => ({
      code,
      name: matrix.feature_names[code] || code,
      dependencies: matrix.dependencies[code] || [],
      dependents: matrix.reverse_dependencies[code] || [],
      level: 0,
    }));

    // Calculate levels based on dependencies
    const calculateLevel = (code: string, visited: Set<string> = new Set()): number => {
      if (visited.has(code)) return 0;
      visited.add(code);

      const deps = matrix.dependencies[code] || [];
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Feature Dependency Matrix
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Visualize how features depend on each other
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'tree'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Tree View
              </button>
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'matrix'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Matrix View
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : viewMode === 'tree' ? (
            <div className="flex-1 overflow-auto p-6">
              {/* Tree View */}
              <div className="space-y-6">
                {/* Root features (no dependencies) */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-3">Base Features (No Dependencies)</h3>
                  <div className="flex flex-wrap gap-2">
                    {dependencyTree
                      .filter(n => n.dependencies.length === 0)
                      .map(node => (
                        <button
                          key={node.code}
                          onClick={() => setSelectedFeature(selectedFeature === node.code ? null : node.code)}
                          className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            selectedFeature === node.code
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            {node.name}
                            {node.dependents.length > 0 && (
                              <span className="text-xs opacity-75">
                                ({node.dependents.length} dependents)
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                </div>

                {/* Dependent features */}
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-3">Features with Dependencies</h3>
                  <div className="space-y-4">
                    {dependencyTree
                      .filter(n => n.dependencies.length > 0)
                      .map(node => (
                        <div
                          key={node.code}
                          className={`p-4 rounded-lg border ${
                            selectedFeature === node.code
                              ? 'border-gray-900 bg-gray-50'
                              : 'border-gray-200'
                          }`}
                        >
                          <button
                            onClick={() => setSelectedFeature(selectedFeature === node.code ? null : node.code)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-gray-400" />
                                <span className="font-medium text-gray-900">{node.name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>Requires: {node.dependencies.length}</span>
                                {node.dependents.length > 0 && (
                                  <span>Required by: {node.dependents.length}</span>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Dependencies */}
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500">Requires:</span>
                            {node.dependencies.map((dep, i) => (
                              <React.Fragment key={dep}>
                                <span
                                  className={`text-xs px-2 py-1 rounded ${
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
                            <ArrowRight className="w-4 h-4 text-gray-400 mx-2" />
                            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
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
            <div className="flex-1 overflow-auto p-6">
              {/* Matrix View */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white p-2 border border-gray-200 text-xs font-medium text-gray-500">
                        Feature
                      </th>
                      {matrix?.features.map(code => (
                        <th
                          key={code}
                          className="p-2 border border-gray-200 text-xs font-medium text-gray-500 whitespace-nowrap"
                          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                        >
                          {matrix.feature_names[code] || code}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix?.features.map(rowCode => (
                      <tr key={rowCode}>
                        <td className="sticky left-0 bg-white p-2 border border-gray-200 text-sm font-medium text-gray-700 whitespace-nowrap">
                          {matrix.feature_names[rowCode] || rowCode}
                        </td>
                        {matrix.features.map(colCode => {
                          const isDependency = (matrix.dependencies[rowCode] || []).includes(colCode);
                          const isDependent = (matrix.reverse_dependencies[rowCode] || []).includes(colCode);
                          const isSelf = rowCode === colCode;

                          return (
                            <td
                              key={colCode}
                              className={`p-2 border border-gray-200 text-center ${
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
                                  <ArrowRight className="w-4 h-4 text-blue-600 mx-auto" />
                                </span>
                              ) : isDependent ? (
                                <span title="Required by">
                                  <ArrowRight className="w-4 h-4 text-green-600 mx-auto rotate-180" />
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
              <div className="mt-4 flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-100 rounded"></div>
                  <span className="text-gray-600">Depends on (requires this feature)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 rounded"></div>
                  <span className="text-gray-600">Required by (this feature requires it)</span>
                </div>
              </div>
            </div>
          )}

          {/* Selected feature detail panel */}
          {selectedFeatureInfo && (
            <div className="w-80 border-l border-gray-200 p-4 bg-gray-50 overflow-auto">
              <h3 className="font-medium text-gray-900 mb-4">{selectedFeatureInfo.name}</h3>

              {selectedFeatureInfo.dependencies.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" />
                    Requires ({selectedFeatureInfo.dependencies.length})
                  </h4>
                  <ul className="space-y-1">
                    {selectedFeatureInfo.dependencies.map(dep => (
                      <li key={dep} className="text-sm text-gray-700 pl-6">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
                    <Info className="w-3 h-3 inline mr-1" />
                    These features must be enabled first
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependents.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 rotate-180" />
                    Required by ({selectedFeatureInfo.dependents.length})
                  </h4>
                  <ul className="space-y-1">
                    {selectedFeatureInfo.dependents.map(dep => (
                      <li key={dep} className="text-sm text-gray-700 pl-6">
                        {matrix?.feature_names[dep] || dep}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs text-amber-700">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Cannot be disabled while these are enabled
                  </div>
                </div>
              )}

              {selectedFeatureInfo.dependencies.length === 0 && selectedFeatureInfo.dependents.length === 0 && (
                <div className="p-3 bg-gray-100 rounded text-sm text-gray-600">
                  This feature has no dependencies and is not required by any other feature.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {matrix?.features.length || 0} features, {Object.keys(matrix?.dependencies || {}).length} with dependencies
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
