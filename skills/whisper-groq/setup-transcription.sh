#!/bin/bash
# Groq Whisper Transcription Setup for Picoclaw
# Simple script to transcribe audio files using Groq's Whisper API

set -e

# Configuration
GROQ_API_KEY=""  # Set this to your Groq API key
GROQ_API_URL="https://api.groq.com/openai/v1/audio/transcriptions"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Usage
usage() {
    echo -e "${GREEN}Groq Whisper Transcription${NC}"
    echo -e "${BLUE}Usage: $0 <audio-file>${NC}"
    echo
e ""
    echo -e "${YELLOW}Options:${NC}"
    echo -e "  --model MODEL    Use specific model (default: whisper-large-v3-turbo)"
    echo -e "  --language LANG    Set language (default: en)"
    echo -e "  --response-only    Only return transcription text (no JSON)"
    echo ""
    echo -e "${GREEN}Example:${NC}"
    echo -e "${BLUE}$0 sample.mp3${NC}"
}

transcribe() {
    local audio_file="$1"
    local model="${2:-whisper-large-v3-turbo}"
    local language="${3:-en}"
    local response_only="$4"

    if [ ! -f "$audio_file" ]; then
        echo -e "${RED}Error: Audio file not found${NC}"
        return 1
    fi

    if [ -z "$GROQ_API_KEY" ]; then
        echo -e "${RED}Error: GROQ_API_KEY not set. Please edit script and add your key.${NC}"
        return 1
    fi

    echo -e "${BLUE}Transcribing: $audio_file${NC}"
    echo -e "${BLUE}Model: $model${NC}"

    # Call Groq Whisper API
    local response=$(curl -s -X POST "$GROQ_API_URL" \
        -H "Authorization: Bearer $GROQ_API_KEY" \
        -H "Content-Type: multipart/form-data" \
        -F "file=@$audio_file;type=audio/ogg;filename=$(basename "$audio_file")" \
        -F "model=$model" \
        -F "response_format=text" \
        -F "language=$language" \
        --silent 2>&1)

    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        # Extract transcription text from response
        local transcription=$(echo "$response" | grep -oP '"text":"[^"]*' | sed 's/.*"text":"\([^"]*\)".*/\1/')

        if [ -n "$response_only" ]; then
            echo -e "${GREEN}Transcription:${NC}"
            echo "$transcription"
        else
            echo -e "${GREEN}Full Response:${NC}"
            echo "$response"
        fi
    else
        echo -e "${RED}Error: API call failed (exit code: $exit_code)${NC}"
        return 1
    fi
}

# Main script logic
case "${1:-}" in
    usage)
        transcribe "$@"
        ;;
    *)
        echo -e "${YELLOW}Transcribing default file: $1${NC}"
        transcribe "$@"
        ;;
esac
