import { ElevenLabsClient as SDKClient } from 'elevenlabs';

export interface ClientConfig {
  apiKey: string;
  retryBaseDelayMs?: number;
  maxRetries?: number;
}

export interface SynthesisRequest {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  outputFormat?: string;
}

const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_RETRIES = 3;

function isRetryable(err: unknown): boolean {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const status = (err as { statusCode: number }).statusCode;
    return status === 429 || (status >= 500 && status <= 599);
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, baseDelayMs: number, maxRetries: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isRetryable(err)) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function createClient(cfg: ClientConfig) {
  const sdk = new SDKClient({ apiKey: cfg.apiKey });
  const baseDelay = cfg.retryBaseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxRetries = cfg.maxRetries ?? DEFAULT_MAX_RETRIES;

  async function synthesize(req: SynthesisRequest): Promise<Buffer> {
    if (!req.text || req.text.trim().length === 0) {
      throw new Error('synthesize: text must be non-empty');
    }

    return withRetry(async () => {
      const stream = await sdk.textToSpeech.convert(req.voiceId, {
        text: req.text,
        model_id: req.modelId ?? 'eleven_multilingual_v2',
        // SDK enum is strict at compile time; accepts any valid ElevenLabs format string at runtime
        output_format: (req.outputFormat ?? 'mp3_44100_128') as any,
        voice_settings: {
          stability: req.stability ?? 0.5,
          similarity_boost: req.similarityBoost ?? 0.75,
        },
      });

      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const audio = Buffer.concat(chunks);
      if (audio.length === 0) {
        throw new Error('synthesize: ElevenLabs returned empty audio buffer');
      }
      return audio;
    }, baseDelay, maxRetries);
  }

  return { synthesize };
}

export type Client = ReturnType<typeof createClient>;
