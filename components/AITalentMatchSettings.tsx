'use client';

import { useState, useEffect } from 'react';
import { Cpu, Zap } from 'lucide-react';

// Local embedding models (no OpenAI)
const EMBEDDING_MODELS = [
  { id: 'bge-small-en-v1.5', name: 'BGE Small', description: 'Recommended - optimized for retrieval', speed: 'fast', isDefault: true },
  { id: 'all-MiniLM-L6-v2', name: 'MiniLM L6', description: 'Fast, good quality', speed: 'fast' },
  { id: 'all-MiniLM-L12-v2', name: 'MiniLM L12', description: 'Balanced speed/quality', speed: 'medium' },
  { id: 'all-mpnet-base-v2', name: 'MPNet Base', description: 'Best quality, slower', speed: 'slow' },
  { id: 'gte-small', name: 'GTE Small', description: 'Very good quality', speed: 'fast' },
];

interface AITalentMatchSettingsProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export default function AITalentMatchSettings({
  selectedModel,
  onModelChange,
}: AITalentMatchSettingsProps) {

  const getSpeedBadge = (speed: string) => {
    const colors: Record<string, string> = {
      fast: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      slow: 'bg-orange-100 text-orange-700',
    };
    return colors[speed] || colors.medium;
  };

  return (
    <div className="p-4 space-y-4">
      {/* Model Selection */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Cpu className="w-4 h-4" />
          Embedding Model
        </label>
        <p className="text-xs text-gray-500">
          Choose the AI model for finding matching candidates
        </p>

        <div className="space-y-2">
          {EMBEDDING_MODELS.map((model) => (
            <label
              key={model.id}
              className={`flex items-center justify-between p-3 border-2 rounded-lg cursor-pointer transition-all ${
                selectedModel === model.id
                  ? 'border-gray-800 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="embedding_model"
                  value={model.id}
                  checked={selectedModel === model.id}
                  onChange={() => onModelChange(model.id)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  selectedModel === model.id ? 'border-gray-800' : 'border-gray-300'
                }`}>
                  {selectedModel === model.id && (
                    <div className="w-2 h-2 bg-gray-800 rounded-full" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{model.name}</span>
                    {model.isDefault && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{model.description}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${getSpeedBadge(model.speed)}`}>
                <Zap className="w-3 h-3 inline mr-1" />
                {model.speed}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
