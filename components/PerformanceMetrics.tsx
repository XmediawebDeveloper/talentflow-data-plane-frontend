import { Activity, Clock, Database, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

interface PerformanceMetricsProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export default function PerformanceMetrics({ position = 'bottom-right' }: PerformanceMetricsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [metrics, setMetrics] = useState({
    loadTime: 0,
    memoryUsage: 0,
    activeRequests: 0,
    cacheHitRate: 0,
  });

  useEffect(() => {
    // Simulate performance metrics
    const updateMetrics = () => {
      setMetrics({
        loadTime: Math.random() * 300 + 100, // 100-400ms
        memoryUsage: Math.random() * 30 + 40, // 40-70%
        activeRequests: Math.floor(Math.random() * 5),
        cacheHitRate: Math.random() * 20 + 80, // 80-100%
      });
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 3000);

    return () => clearInterval(interval);
  }, []);

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className={`fixed ${positionClasses[position]} z-[100]`}>
      {isExpanded ? (
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72 animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-800" />
              <h3 className="text-sm text-gray-900">Performance</h3>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              Minimize
            </button>
          </div>

          {/* Metrics */}
          <div className="space-y-3">
            {/* Load Time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs text-gray-600">Load Time</span>
              </div>
              <span className={`text-xs ${metrics.loadTime < 200 ? 'text-green-600' : metrics.loadTime < 300 ? 'text-yellow-600' : 'text-red-600'}`}>
                {Math.round(metrics.loadTime)}ms
              </span>
            </div>

            {/* Memory Usage */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-gray-800" />
                <span className="text-xs text-gray-600">Memory</span>
              </div>
              <span className={`text-xs ${metrics.memoryUsage < 50 ? 'text-green-600' : metrics.memoryUsage < 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                {Math.round(metrics.memoryUsage)}%
              </span>
            </div>

            {/* Active Requests */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-yellow-600" />
                <span className="text-xs text-gray-600">Active Requests</span>
              </div>
              <span className="text-xs text-gray-900">{metrics.activeRequests}</span>
            </div>

            {/* Cache Hit Rate */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600">Cache Hit Rate</span>
                <span className="text-xs text-gray-900">{Math.round(metrics.cacheHitRate)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-gray-800 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${metrics.cacheHitRate}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Status</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-600">Healthy</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 hover:shadow-xl transition-all group"
          title="Show performance metrics"
        >
          <Activity className="w-5 h-5 text-gray-800 group-hover:scale-110 transition-transform" />
        </button>
      )}
    </div>
  );
}
