# AI providers and models

Talk AI sends only transcript text and the selected cleanup prompt to the configured AI provider. Recorded audio is handled by the selected transcription engine and is not sent to cleanup providers.

## Supported providers

The cleanup server supports xAI, OpenAI, Groq, Mistral, DeepSeek, Together AI, Fireworks AI, OpenRouter, Perplexity, Google Gemini, custom OpenAI-compatible endpoints, and local CLI tools.

Remote providers use their OpenAI-compatible `/chat/completions` and `/models` APIs. Google Gemini uses Google's OpenAI compatibility endpoint. OpenRouter requests include the Talk AI application attribution headers, and DeepSeek cleanup requests explicitly disable thinking so the output budget is reserved for the cleaned transcript.

Each provider has a small curated model list that works before catalog discovery. **Load available models** calls the selected provider's `/models` endpoint using the saved credential and merges every returned model into the selector. A custom model ID can always be entered for models that a provider does not return from its catalog.

## Credentials

API keys are never included in client settings, global settings, cleanup evidence, logs, or model-list responses. The owner can test a draft key without saving it or use **Save and test** to store it only after a successful connection test. Saved credentials use AES-256-GCM encryption and a separate row per provider. The interface exposes only the final four characters.

Server environment variables take precedence over saved credentials:

- `XAI_API_KEY`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`
- `MISTRAL_API_KEY`
- `DEEPSEEK_API_KEY`
- `TOGETHER_API_KEY`
- `FIREWORKS_API_KEY`
- `OPENROUTER_API_KEY`
- `PERPLEXITY_API_KEY`
- `GEMINI_API_KEY`

Set `PROVIDER_CREDENTIAL_SECRET` in hosted environments so encrypted credentials remain readable when database or provider credentials rotate. `BETTER_AUTH_SECRET` is the next preferred key source when a dedicated secret is not configured. Do not place provider secrets in `VITE_` variables.

## Local tools and macOS Core ML transcription

Local cleanup supports Codex, Claude, Grok, Ollama, Gemini, Cursor, Aider, Graphite, and GitHub CLI when their executables are available on `PATH`.

The website can use an existing WhisperKit/Core ML Large v3 Turbo model without copying the model into the repository or loading it into the browser process. Configure:

- `TALKAI_LOCAL_MODE=1`
- `TALKAI_WHISPERKIT_CLI=/absolute/path/to/whisperkit-cli`
- `TALKAI_WHISPERKIT_MODEL_DIR=/absolute/path/to/openai_whisper-large-v3_turbo`
- `TALKAI_FFMPEG_PATH=/absolute/path/to/ffmpeg` (optional override; TalkAI otherwise uses its bundled FFmpeg)

In local mode, Talk AI fails closed when that CLI or model cannot be opened and will not download a Transformers/ONNX fallback. Long recordings are split into ordered 25-second WAV segments, transcribed in one isolated Core ML process, and joined before the server returns success. The process exits after each recording so model memory is released while the model remains persistent on disk.

FFmpeg is installed with Talk AI and resolved independently of the shell `PATH`. Set `TALKAI_FFMPEG_PATH` only when an operator intentionally wants to use a specific executable.

Local WhisperKit is optional. Point `TALKAI_WHISPERKIT_CLI` and `TALKAI_WHISPERKIT_MODEL_DIR` at tools you install yourself. Talk AI is a website; it does not ship a Dock launcher or Electron wrapper.
