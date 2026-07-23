from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from httpx import HTTPError

from .schemas import TranscribeRequest, TranscribeResponse, TtsRequest
from .settings import settings
from .stt import SpeechInputError, SpeechModelLoadError, SpeechTranscriber
from .tts import KokoroTtsClient

app = FastAPI(title="Cocomama Voice Gateway", version="0.1.0")
transcriber = SpeechTranscriber(settings)
tts_client = KokoroTtsClient(settings)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/stt/transcribe", response_model=TranscribeResponse)
def transcribe(request: TranscribeRequest) -> TranscribeResponse:
    try:
        return transcriber.transcribe(request)
    except SpeechInputError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except SpeechModelLoadError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/v1/tts/stream")
async def stream_tts(request: TtsRequest) -> StreamingResponse:
    media_type = KokoroTtsClient._media_type(request.response_format)

    async def audio_stream():
        try:
            async for chunk in tts_client.stream(request):
                yield chunk
        except HTTPError as error:
            raise HTTPException(
                status_code=502,
                detail="Kokoro TTS service failed.",
            ) from error

    return StreamingResponse(audio_stream(), media_type=media_type)
