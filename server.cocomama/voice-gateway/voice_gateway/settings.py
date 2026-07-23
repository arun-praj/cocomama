from __future__ import annotations

import os
from dataclasses import dataclass


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)

    if value is None or value == "":
        return default

    return int(value)


@dataclass(frozen=True)
class VoiceGatewaySettings:
    host: str = os.getenv("VOICE_GATEWAY_HOST", "0.0.0.0")
    port: int = _get_int("VOICE_GATEWAY_PORT", 8010)
    max_audio_bytes: int = _get_int("VOICE_MAX_AUDIO_BYTES", 8 * 1024 * 1024)
    stt_model: str = os.getenv("VOICE_STT_MODEL", "tiny.en")
    stt_device: str = os.getenv("VOICE_STT_DEVICE", "cpu")
    stt_compute_type: str = os.getenv("VOICE_STT_COMPUTE_TYPE", "int8")
    stt_cpu_threads: int = _get_int("VOICE_STT_CPU_THREADS", 4)
    stt_beam_size: int = _get_int("VOICE_STT_BEAM_SIZE", 1)
    stt_language: str | None = os.getenv("VOICE_STT_LANGUAGE") or None
    vad_min_silence_duration_ms: int = _get_int(
        "VOICE_VAD_MIN_SILENCE_DURATION_MS",
        500,
    )
    vad_speech_pad_ms: int = _get_int("VOICE_VAD_SPEECH_PAD_MS", 120)
    kokoro_base_url: str = os.getenv("KOKORO_BASE_URL", "http://localhost:8880")
    kokoro_model: str = os.getenv("KOKORO_MODEL", "kokoro")
    kokoro_default_voice: str = os.getenv("VOICE_TTS_DEFAULT_VOICE", "af_sky")
    kokoro_timeout_seconds: int = _get_int("KOKORO_TIMEOUT_SECONDS", 60)


settings = VoiceGatewaySettings()
