#!/bin/bash
# Groq Whisper Transcription Script for Picoclaw (FIXED)

# Configuration
GROQ_API_URL="https://api.groq.com/openai/v1/audio/transcriptions"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# API Key — read from env, then from ~/.credentials/groq.env as fallback.
if [ -z "${GROQ_API_KEY:-}" ] && [ -f "$HOME/.credentials/groq.env" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.credentials/groq.env"
fi
if [ -z "${GROQ_API_KEY:-}" ]; then
  echo "ERROR: GROQ_API_KEY not set. Export it or put GROQ_API_KEY=<key> in ~/.credentials/groq.env" >&2
  exit 1
fi

usage() {
    echo -e "${GREEN}Groq Whisper Transcription${NC}"
    echo -e ""
    echo -e "${BLUE}Usage:${NC}"
    echo -e "  $0 <audio-file> [options]${NC}"
    echo -e ""
    echo -e "${YELLOW}Options:${NC}"
    echo -e "  --model MODEL    Use specific model (default: whisper-large-v3-turbo)"
    echo -e "  --language LANG  Set language (default: en)"
    echo -e "  --debug         Show detailed debug information"
    echo -e ""
}

transcribe() {
    local audio_file=""
    local model="whisper-large-v3-turbo"
    local language="en"
    local debug_mode=0

    # Basic argument parsing
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --model) model="$2"; shift ;;
            --language) language="$2"; shift ;;
            --debug) debug_mode=1 ;;
            *) 
                if [ -z "$audio_file" ]; then
                    audio_file="$1"
                fi
                ;;
        esac
        shift
    done

    if [ -z "$audio_file" ]; then
        usage
        return 1
    fi

    if [ ! -f "$audio_file" ]; then
        echo -e "${RED}Error: Audio file not found: $audio_file${NC}"
        return 1
    fi

    if [ -z "$GROQ_API_KEY" ]; then
        echo -e "${RED}Error: GROQ_API_KEY not set.${NC}"
        return 1
    fi

    if [ "$debug_mode" -eq 1 ]; then
        echo -e "${BLUE}[DEBUG] File: $audio_file${NC}"
        echo -e "${BLUE}[DEBUG] Model: $model${NC}"
    fi

    local response=$(curl -s -X POST "$GROQ_API_URL" \
        -H "Authorization: Bearer $GROQ_API_KEY" \
        -H "Content-Type: multipart/form-data" \
        -F "file=@$audio_file" \
        -F "model=$model" \
        -F "response_format=json" \
        -F "language=$language")

    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        # Extract text from JSON using grep/sed for minimal dependencies
        local transcription=$(echo "$response" | grep -oP '"text"\s*:\s*"\K[^"]+')
        if [ -n "$transcription" ]; then
            echo -e "${GREEN}Transcription:${NC}"
            echo "$transcription"
        else
            echo -e "${RED}Error: Could not extract transcription from response.${NC}"
            echo -e "${YELLOW}Raw Response: $response${NC}"
        fi
    else
        echo -e "${RED}Error: API call failed with exit code $exit_code${NC}"
        echo -e "${YELLOW}Response: $response${NC}"
        return 1
    fi
}

transcribe "$@"
