'use client';

import { useState, useCallback, useRef } from 'react';

interface QueuedRequest {
  id: string;
  operation: () => Promise<void>;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  onSuccess?: () => void;
  onFailure?: (error: any) => void;
  metadata?: any;
}

interface RetryQueueHook {
  queueSize: number;
  isProcessing: boolean;
  addToQueue: (operation: () => Promise<void>, options?: {
    maxRetries?: number;
    onSuccess?: () => void;
    onFailure?: (error: any) => void;
    metadata?: any;
  }) => string;
  removeFromQueue: (id: string) => void;
  processQueue: () => Promise<void>;
  clearQueue: () => void;
  getQueuedRequests: () => QueuedRequest[];
}

/**
 * Hook for managing a retry queue for failed network requests.
 * Queues failed operations and retries them with exponential backoff.
 */
export function useRetryQueue(): RetryQueueHook {
  const [queue, setQueue] = useState<QueuedRequest[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const queueIdCounter = useRef(0);

  const addToQueue = useCallback((
    operation: () => Promise<void>,
    options?: {
      maxRetries?: number;
      onSuccess?: () => void;
      onFailure?: (error: any) => void;
      metadata?: any;
    }
  ): string => {
    const id = `retry_${++queueIdCounter.current}_${Date.now()}`;
    const queuedRequest: QueuedRequest = {
      id,
      operation,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: options?.maxRetries ?? 3,
      onSuccess: options?.onSuccess,
      onFailure: options?.onFailure,
      metadata: options?.metadata,
    };

    setQueue(prev => [...prev, queuedRequest]);
    console.log(`[RETRY-QUEUE] Added request ${id} to queue`);

    return id;
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(req => req.id !== id));
    console.log(`[RETRY-QUEUE] Removed request ${id} from queue`);
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    console.log('[RETRY-QUEUE] Queue cleared');
  }, []);

  const getQueuedRequests = useCallback(() => {
    return [...queue];
  }, [queue]);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queue.length === 0) {
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    console.log(`[RETRY-QUEUE] Processing ${queue.length} queued requests...`);

    const currentQueue = [...queue];
    const failedRequests: QueuedRequest[] = [];
    const successfulIds: string[] = [];

    for (const request of currentQueue) {
      try {
        console.log(`[RETRY-QUEUE] Retrying request ${request.id} (attempt ${request.retryCount + 1}/${request.maxRetries})`);

        await request.operation();

        // Success
        successfulIds.push(request.id);
        request.onSuccess?.();
        console.log(`[RETRY-QUEUE] ✅ Request ${request.id} succeeded`);
      } catch (error) {
        console.error(`[RETRY-QUEUE] ❌ Request ${request.id} failed:`, error);

        // Increment retry count
        request.retryCount++;

        // Check if should retry
        if (request.retryCount < request.maxRetries) {
          failedRequests.push(request);
          console.log(`[RETRY-QUEUE] Will retry request ${request.id} (${request.maxRetries - request.retryCount} attempts remaining)`);
        } else {
          console.log(`[RETRY-QUEUE] Max retries reached for request ${request.id}, giving up`);
          request.onFailure?.(error);
        }
      }

      // Small delay between retries to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update queue: remove successful requests, keep failed ones for retry
    setQueue(failedRequests);

    processingRef.current = false;
    setIsProcessing(false);

    if (successfulIds.length > 0) {
      console.log(`[RETRY-QUEUE] ✅ ${successfulIds.length} requests succeeded`);
    }
    if (failedRequests.length > 0) {
      console.log(`[RETRY-QUEUE] ⚠️ ${failedRequests.length} requests still pending`);
    }
  }, [queue]);

  return {
    queueSize: queue.length,
    isProcessing,
    addToQueue,
    removeFromQueue,
    processQueue,
    clearQueue,
    getQueuedRequests,
  };
}
