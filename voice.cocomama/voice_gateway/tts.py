from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from .schemas import TtsRequest
from .settings import VoiceGatewaySettings


class KokoroTtsClient:
    def __init__(self, settings: VoiceGatewaySettings) -> None:
        self._settings = settings

    async def stream(self, request: TtsRequest) -> AsyncIterator[bytes]:
        payload = {
            "model": self._settings.kokoro_model,
            "voice": request.voice or self._settings.kokoro_default_voice,
            "input": request.text,
            "response_format": request.response_format,
        }
        timeout = httpx.Timeout(self._settings.kokoro_timeout_seconds)
        base_url = self._settings.kokoro_base_url.rstrip("/")

        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST",
                f"{base_url}/v1/audio/speech",
                json=payload,
                headers={"accept": self._media_type(request.response_format)},
            ) as response:
                response.raise_for_status()

                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk

    @staticmethod
    def _media_type(response_format: str) -> str:
        if response_format == "wav":
            return "audio/wav"

        if response_format == "opus":
            return "audio/ogg"

        return "audio/mpeg"
