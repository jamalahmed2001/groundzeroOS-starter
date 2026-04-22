---
name: whisper-groq
description: Transcribe audio files using Groq's Whisper API (extremely accurate, free tier)
metadata: {"clawdbot":{"emoji":"🎤","requires":["curl"],"api_key":"$GROQ_API_KEY (or ~/.credentials/groq.env)"}}
---

# Groq Whisper Transcription

**Extremely accurate** speech-to-text conversion using Groq's Whisper API for audio transcription.

**Features:**
- Ultra-accurate transcription (handles accents, noisy audio, multiple languages)
- Free tier API access (no cost)
- No installation required (uses curl)
- Returns clean text transcription
- Supports all common audio formats (OGG, MP3, WAV, M4A, FLAC)

## Usage

### Transcribe Audio File
```
/whisper-groq <audio-file>
```

### Transcribe with Specific Model
```
/whisper-groq <audio-file> --model whisper-large-v3
```

### Get API Info
```
/whisper-groq --api-info
```

## Configuration

### API Key
Groq API key is configured in skill metadata. Uses free tier.

### API Endpoint
`https://api.groq.com/openai/v1/audio/transcriptions`

### Audio Formats Supported
- OGG (WhatsApp voice notes)
- MP3, WAV, M4A, FLAC
- Max file size: 25MB
- Max duration: 2 hours

## Available Models

- `whisper-large-v3` (default) - Extremely accurate, handles accents/noise well
- `whisper-large-v3-turbo` - Fast, good accuracy
- `whisper-base` - Very fast, good for quick transcriptions

## How It Works

1. **Upload** - Audio file sent to Groq's Whisper API
2. **Transcribe** - Model processes audio and returns text
3. **Return** - Clean text transcription

## Performance

- Large model: ~10-30 seconds per minute of audio
- Turbo model: ~2x faster with similar accuracy
- Free tier: Rate limits apply

## Examples

### Basic Transcription
```bash
# Transcribe audio file
/whisper-groq sample-audio.ogg

# Result
"Here is the transcribed text..."
```

### Custom Model
```bash
# Use faster model
/whisper-groq sample-audio.ogg --model whisper-large-v3-turbo
```

## Error Handling

### API Errors
- Invalid API key → Clear error message
- File too large → Suggest splitting
- Rate limit → Retry after delay

### Audio File Issues
- File not found → Check path
- Corrupt audio → Suggest re-encoding
- Unsupported format → Convert to supported format (MP3/WAV)

## Technical Details

### Dependencies
- `curl` - HTTP requests (no external packages needed)

### Response Format
Returns plain text transcription by default (no JSON overhead).

### Script
Located at: `~/clawd/skills/whisper-groq/transcribe.sh`

## Troubleshooting

### API Key Issues
```
/whisper-groq --api-info
```

### Connection Test
```
# Test with sample audio
/whisper-groq test-audio.mp3
```

## Notes

- Uses Groq's Whisper API for transcription
- API key configured in skill metadata
- Best for meetings, voice notes, lectures
- Free tier (no cost)
