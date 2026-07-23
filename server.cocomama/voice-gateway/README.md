# Cocomama Voice Gateway

Local open-source speech service for the authenticated Node backend voice routes.

## Stack

- STT: `faster-whisper` with CTranslate2.
- VAD: Silero VAD through `faster-whisper` `vad_filter=True`.
- TTS: Kokoro via an OpenAI-compatible Kokoro-FastAPI service.

## Run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn voice_gateway.main:app --host 0.0.0.0 --port 8010
```

Run Kokoro separately, for example with the Kokoro-FastAPI container on port `8880`, then set `VOICE_GATEWAY_BASE_URL=http://localhost:8010` in the Node backend environment.

## Offline STT Model

If Hugging Face downloads are blocked on your current network, download the faster-whisper CTranslate2 model outside that network and point `VOICE_STT_MODEL` at the local directory.

Example for the small local-development model:

```powershell
cd server.cocomama/voice-gateway
.\.venv\Scripts\huggingface-cli.exe download Systran/faster-whisper-tiny.en --local-dir models/faster-whisper-tiny.en
$env:VOICE_STT_MODEL = "models/faster-whisper-tiny.en"
.\.venv\Scripts\python.exe -m uvicorn --app-dir . voice_gateway.main:app --host 0.0.0.0 --port 8010
```

Use the same pattern for a larger production model directory. The `models/` folder is ignored because model files are large runtime artifacts.

## Key Environment Variables

- `VOICE_STT_MODEL`: defaults to `tiny.en` for local development. Use `distil-large-v3` or another larger faster-whisper model in production.
- `VOICE_STT_DEVICE`: `cpu` or `cuda`, defaults to `cpu`.
- `VOICE_STT_COMPUTE_TYPE`: defaults to `int8`; use `float16` on CUDA.
- `VOICE_STT_CPU_THREADS`: defaults to `4`.
- `VOICE_STT_LANGUAGE`: optional language hint such as `en`.
- `VOICE_VAD_MIN_SILENCE_DURATION_MS`: defaults to `500`.
- `VOICE_VAD_SPEECH_PAD_MS`: defaults to `120`.
- `KOKORO_BASE_URL`: defaults to `http://localhost:8880`.
- `VOICE_TTS_DEFAULT_VOICE`: defaults to `af_sky`.
