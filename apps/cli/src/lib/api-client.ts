import type { CliConfig } from './config';

/**
 * Detects the preferred locale for API error messages.
 * Priority: ARCTURUS_LANG env var > LC_ALL > LANG > 'en'.
 * Any value starting with "ko" (case-insensitive) maps to Korean.
 */
function detectLocale(): string {
  const candidate =
    process.env['ARCTURUS_LANG'] ?? process.env['LC_ALL'] ?? process.env['LANG'] ?? '';
  return candidate.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export class ApiClient {
  private readonly acceptLanguage = detectLocale();

  constructor(private readonly config: CliConfig) {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.config.serverUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Accept-Language': this.acceptLanguage,
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  /**
   * Uploads a file as multipart/form-data via a chunked ReadableStream so that
   * byte-level progress can be reported. `onProgress` is called with a 0–1
   * fraction as chunks are enqueued (≈ when they leave the process).
   */
  async requestUpload<T>(
    path: string,
    fields: Record<string, string>,
    file: { name: string; bytes: Buffer },
    onProgress?: (fraction: number) => void,
  ): Promise<T> {
    const boundary = `----ArcturusBoundary${Date.now().toString(16)}`;

    const parts: Buffer[] = [];
    for (const [key, value] of Object.entries(fields)) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        ),
      );
    }
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
    );
    parts.push(file.bytes);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const total = body.length;
    const CHUNK = 64 * 1024; // 64 KB
    let sent = 0;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= total) {
          controller.close();
          return;
        }
        const chunk = body.subarray(sent, sent + CHUNK);
        sent += chunk.length;
        onProgress?.(sent / total);
        controller.enqueue(chunk);
      },
    });

    const response = await fetch(`${this.config.serverUrl}${path}`, {
      method: 'POST',
      body: stream,
      // duplex:'half' is required for streaming request bodies in some runtimes;
      // cast to RequestInit so TypeScript doesn't complain about the extra key.
      duplex: 'half',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Accept-Language': this.acceptLanguage,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(total),
      },
    } as RequestInit);

    if (!response.ok) {
      const responseBody = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(responseBody.message ?? `${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  /**
   * Follows a server-sent-event stream, invoking onLine per data event.
   * Resolves with the "done" event payload, or null if the stream just ends.
   */
  async streamSse(path: string, onLine: (line: string) => void): Promise<string | null> {
    const response = await fetch(`${this.config.serverUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Accept-Language': this.acceptLanguage,
      },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Stream failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = buffer.slice(0, newlineIndex).trimEnd();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');

        if (rawLine.startsWith('event: ')) {
          currentEvent = rawLine.slice('event: '.length);
        } else if (rawLine.startsWith('data: ')) {
          const payload = JSON.parse(rawLine.slice('data: '.length)) as string;
          if (currentEvent === 'done') return payload;
          onLine(payload);
          currentEvent = 'message';
        }
      }
    }
  }
}
