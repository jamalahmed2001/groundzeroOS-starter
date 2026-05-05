import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the elevenlabs SDK before importing the client
vi.mock('elevenlabs', () => ({
  ElevenLabsClient: vi.fn().mockImplementation(() => ({
    textToSpeech: {
      convert: vi.fn(),
    },
  })),
}));

import { createClient } from '../src/client.js';
import { ElevenLabsClient as SDKClient } from 'elevenlabs';

function makeStreamFrom(buf: Buffer): AsyncIterable<Uint8Array> {
  return (async function* () {
    yield buf;
  })();
}

describe('elevenlabs-tts client', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('synthesises non-empty text and returns the audio buffer', async () => {
    const fakeAudio = Buffer.from('FAKE_MP3_DATA');
    const sdk = {
      textToSpeech: { convert: vi.fn().mockResolvedValue(makeStreamFrom(fakeAudio)) },
    };
    (SDKClient as any).mockImplementationOnce(() => sdk);

    const c = createClient({ apiKey: 'test-key' });
    const out = await c.synthesize({ text: 'hello', voiceId: 'v1' });

    expect(out).toBeInstanceOf(Buffer);
    expect(out.equals(fakeAudio)).toBe(true);
    expect(sdk.textToSpeech.convert).toHaveBeenCalledWith('v1', expect.objectContaining({
      text: 'hello',
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }));
  });

  it('rejects empty or whitespace-only text without calling the API', async () => {
    const sdk = { textToSpeech: { convert: vi.fn() } };
    (SDKClient as any).mockImplementationOnce(() => sdk);
    const c = createClient({ apiKey: 'k' });

    await expect(c.synthesize({ text: '', voiceId: 'v' })).rejects.toThrow(/non-empty/);
    await expect(c.synthesize({ text: '   \n  ', voiceId: 'v' })).rejects.toThrow(/non-empty/);
    expect(sdk.textToSpeech.convert).not.toHaveBeenCalled();
  });

  it('throws on empty audio buffer (no silent pass)', async () => {
    const sdk = {
      textToSpeech: { convert: vi.fn().mockResolvedValue(makeStreamFrom(Buffer.alloc(0))) },
    };
    (SDKClient as any).mockImplementationOnce(() => sdk);
    const c = createClient({ apiKey: 'k', maxRetries: 0 });

    await expect(c.synthesize({ text: 'hi', voiceId: 'v' })).rejects.toThrow(/empty audio/);
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    const err429 = Object.assign(new Error('rate limited'), { statusCode: 429 });
    const convert = vi.fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce(makeStreamFrom(Buffer.from('ok')));
    (SDKClient as any).mockImplementationOnce(() => ({ textToSpeech: { convert } }));

    const c = createClient({ apiKey: 'k', retryBaseDelayMs: 1, maxRetries: 2 });
    const out = await c.synthesize({ text: 'hi', voiceId: 'v' });

    expect(out.toString()).toBe('ok');
    expect(convert).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable errors (401 auth)', async () => {
    const err401 = Object.assign(new Error('unauthorized'), { statusCode: 401 });
    const convert = vi.fn().mockRejectedValue(err401);
    (SDKClient as any).mockImplementationOnce(() => ({ textToSpeech: { convert } }));

    const c = createClient({ apiKey: 'k', retryBaseDelayMs: 1, maxRetries: 5 });
    await expect(c.synthesize({ text: 'hi', voiceId: 'v' })).rejects.toThrow(/unauthorized/);
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('respects per-call voice + model overrides', async () => {
    const convert = vi.fn().mockResolvedValue(makeStreamFrom(Buffer.from('x')));
    (SDKClient as any).mockImplementationOnce(() => ({ textToSpeech: { convert } }));

    const c = createClient({ apiKey: 'k' });
    await c.synthesize({
      text: 'x',
      voiceId: 'CHARACTER_A',
      modelId: 'eleven_turbo_v2_5',
      stability: 0.8,
      similarityBoost: 0.3,
      outputFormat: 'opus_48000_64',
    });

    expect(convert).toHaveBeenCalledWith('CHARACTER_A', expect.objectContaining({
      model_id: 'eleven_turbo_v2_5',
      output_format: 'opus_48000_64',
      voice_settings: { stability: 0.8, similarity_boost: 0.3 },
    }));
  });
});
