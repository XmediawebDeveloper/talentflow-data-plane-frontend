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
  /** Set when the Job Title names a different tech stack than the AI Prompt's
   *  requirements (e.g. title "Frontend Developer" with "Java, Spring Boot,
   *  Microservices" as requirements) - see detect_title_tech_stack_mismatch in
   *  openai_service.py. The title is still kept as the source of truth for the
   *  generated description; this only flags the mismatch for the recruiter. */
  role_mismatch_warning?: string;
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
  error_code?: string;
}

export interface SSEConnectedEvent {
  type: 'connected';
}

/** Emitted when text streaming finishes, before param extraction. The backend yields
 *  this (routers/job_descriptions.py) and SSECallbacks already declares onTextComplete;
 *  only this variant was missing from the union, so the switch case was unreachable. */
export interface SSETextCompleteEvent {
  type: 'text_complete';
}

export type SSEEvent = SSEChunkEvent | SSETitleEvent | SSECompleteEvent | SSEErrorEvent | SSEConnectedEvent | SSETextCompleteEvent;

export interface SSECallbacks {
  onChunk?: (content: string) => void;
  onTitle?: (title: string) => void;
  onTextComplete?: () => void;  // Called when text streaming is done, before param extraction
  onComplete?: (data: { title: string; description: string; extracted_params: any; role_mismatch_warning?: string }) => void;
  onError?: (message: string, errorCode?: string) => void;
  onConnected?: () => void;
}

export interface JDGenerationStreamInput {
  jobTitle: string;
  aiPrompt: string;
  preGeneratedId?: string;
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
  async stream(data: JDGenerationStreamInput, callbacks: SSECallbacks): Promise<void> {
    this.isAborted = false;
    this.reconnectAttempts = 0;

    return this.connect(data, callbacks);
  }

  private async connect(data: JDGenerationStreamInput, callbacks: SSECallbacks): Promise<void> {
    if (this.isAborted) {
      throw new Error('Stream aborted');
    }

    this.abortController = new AbortController();

    try {
      const params = new URLSearchParams({
        job_title: data.jobTitle,
        ai_prompt: data.aiPrompt,
      });
      if (data.preGeneratedId) {
        params.set('pre_generated_id', data.preGeneratedId);
      }
      const url = `${this.apiBaseUrl}/jd/generate-stream?${params.toString()}`;

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
        let message = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorBody = await response.clone().json();
          const detail = errorBody?.detail;
          if (typeof detail === 'string' && detail.trim()) {
            message = detail;
          } else if (Array.isArray(detail) && detail[0]?.msg) {
            message = detail[0].msg;
          }
        } catch {
          // Ignore parse errors and use the default HTTP message.
        }
        throw new Error(message);
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

              case 'text_complete':
                console.log('[Stream] Text generation complete, extracting params...');
                callbacks.onTextComplete?.();
                break;

              case 'complete':
                console.log('[Stream] Generation complete');
                callbacks.onComplete?.({
                  title: data.title,
                  description: data.description,
                  extracted_params: data.extracted_params,
                  role_mismatch_warning: data.role_mismatch_warning
                });
                return true; // Signal completion

              case 'error':
                console.error('[Stream] Server error:', data.message, data.error_code);
                callbacks.onError?.(data.message, data.error_code);
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
        return this.connect(data, callbacks);
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
