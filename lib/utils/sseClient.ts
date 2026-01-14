/**
 * SSE Client for streaming JD generation
 * Uses fetch with ReadableStream to support Authorization headers
 */

export interface SSEChunkEvent {
  type: 'chunk';
  content: string;
}

export interface SSETitleEvent {
  type: 'title';
  content: string;
}

export interface SSECompleteEvent {
  type: 'complete';
  title: string;
  description: string;
  extracted_params: any;
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
}

export interface SSEConnectedEvent {
  type: 'connected';
}

export type SSEEvent = SSEChunkEvent | SSETitleEvent | SSECompleteEvent | SSEErrorEvent | SSEConnectedEvent;

export interface SSECallbacks {
  onChunk?: (content: string) => void;
  onTitle?: (title: string) => void;
  onComplete?: (data: { title: string; description: string; extracted_params: any }) => void;
  onError?: (message: string) => void;
  onConnected?: () => void;
}

export class JDStreamClient {
  private abortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 10000;
  private isAborted = false;

  constructor(
    private apiBaseUrl: string,
    private accessToken: string
  ) {}

  /**
   * Start streaming JD generation using fetch with ReadableStream
   */
  async stream(prompt: string, callbacks: SSECallbacks): Promise<void> {
    this.isAborted = false;
    this.reconnectAttempts = 0;

    return this.connect(prompt, callbacks);
  }

  private async connect(prompt: string, callbacks: SSECallbacks): Promise<void> {
    if (this.isAborted) {
      throw new Error('Stream aborted');
    }

    this.abortController = new AbortController();

    try {
      const encodedPrompt = encodeURIComponent(prompt);
      const url = `${this.apiBaseUrl}/jd/generate-stream?prompt=${encodedPrompt}`;

      console.log('[Stream] Connecting to:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'text/event-stream',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      callbacks.onConnected?.();
      console.log('[Stream] Connected successfully');

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Helper function to process SSE lines
      const processLine = (line: string): boolean => {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6); // Remove 'data: ' prefix

          try {
            const data: SSEEvent = JSON.parse(jsonStr);

            switch (data.type) {
              case 'connected':
                console.log('[Stream] Server acknowledged');
                break;

              case 'chunk':
                callbacks.onChunk?.(data.content);
                break;

              case 'title':
                callbacks.onTitle?.(data.content);
                break;

              case 'complete':
                console.log('[Stream] Generation complete');
                callbacks.onComplete?.({
                  title: data.title,
                  description: data.description,
                  extracted_params: data.extracted_params
                });
                return true; // Signal completion

              case 'error':
                console.error('[Stream] Server error:', data.message);
                callbacks.onError?.(data.message);
                throw new Error(data.message);
            }
          } catch (err) {
            if (err instanceof Error && err.message.includes('error')) {
              throw err; // Re-throw server errors
            }
            console.warn('[Stream] Failed to parse message:', jsonStr);
          }
        }
        return false;
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[Stream] Stream ended, processing remaining buffer');
          // Process any remaining data in buffer when stream ends
          if (buffer.trim()) {
            const remainingLines = buffer.split('\n');
            for (const line of remainingLines) {
              if (processLine(line)) {
                return; // Complete event was found
              }
            }
          }
          console.log('[Stream] No complete event in remaining buffer');
          break;
        }

        // Decode the chunk
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (processLine(line)) {
            return; // Complete event was found
          }
        }
      }
    } catch (error) {
      if (this.isAborted) {
        console.log('[Stream] Aborted by user');
        return;
      }

      console.error('[Stream] Error:', error);

      // Retry with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(
          this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
          this.maxReconnectDelay
        );

        console.log(`[Stream] Retrying in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect(prompt, callbacks);
      }

      // All retries failed
      const message = error instanceof Error ? error.message : 'Streaming failed';
      callbacks.onError?.(message);
      throw error;
    }
  }

  /**
   * Abort the streaming connection
   */
  abort(): void {
    console.log('[Stream] Aborting');
    this.isAborted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
