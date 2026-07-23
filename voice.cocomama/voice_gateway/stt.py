from __future__ import annotations

import base64
import binascii
import os
import tempfile
import time
from collections.abc import Iterable

from faster_whisper import WhisperModel

from .schemas import TranscribeRequest, TranscribeResponse, TranscriptSegment
from .settings import VoiceGatewaySettings


class SpeechInputError(ValueError):
    pass


class SpeechModelLoadError(RuntimeError):
    pass


class SpeechTranscriber:
    def __init__(self, settings: VoiceGatewaySettings) -> None:
        self._settings = settings
        self._model: WhisperModel | None = None

    @property
    def model(self) -> WhisperModel:
        if self._model is None:
            try:
                self._model = WhisperModel(
                    self._settings.stt_model,
                    device=self._settings.stt_device,
                    compute_type=self._settings.stt_compute_type,
                    cpu_threads=self._settings.stt_cpu_threads,
                )
            except Exception as error:
                raise SpeechModelLoadError(
                    "Speech model could not be loaded. The first run downloads "
                    f'VOICE_STT_MODEL="{self._settings.stt_model}" from Hugging Face; '
                    "check the network connection or set VOICE_STT_MODEL to a "
                    "local faster-whisper model directory."
                ) from error

        return self._model

    def transcribe(self, request: TranscribeRequest) -> TranscribeResponse:
        audio_bytes = self._decode_audio(request.audio_base64)
        suffix = self._suffix_for_mime_type(request.mime_type)
        started_at = time.perf_counter()

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as audio_file:
            audio_file.write(audio_bytes)
            audio_path = audio_file.name

        try:
            segments_iterable, info = self.model.transcribe(
                audio_path,
                beam_size=self._settings.stt_beam_size,
                condition_on_previous_text=False,
                language=request.language or self._settings.stt_language,
                vad_filter=True,
                vad_parameters={
                    "min_silence_duration_ms": self._settings.vad_min_silence_duration_ms,
                    "speech_pad_ms": self._settings.vad_speech_pad_ms,
                },
            )
            segments = self._collect_segments(segments_iterable)
        finally:
            os.unlink(audio_path)

        text = " ".join(
            segment.text.strip() for segment in segments if segment.text.strip()
        ).strip()
        duration_ms = (time.perf_counter() - started_at) * 1000

        return TranscribeResponse(
            text=text,
            language=getattr(info, "language", None),
            duration_ms=duration_ms,
            segments=segments,
        )

    def _decode_audio(self, audio_base64: str) -> bytes:
        try:
            audio_bytes = base64.b64decode(audio_base64, validate=True)
        except binascii.Error as error:
            raise SpeechInputError("Audio payload is not valid base64.") from error

        if not audio_bytes:
            raise SpeechInputError("Audio payload is empty.")

        if len(audio_bytes) > self._settings.max_audio_bytes:
            raise SpeechInputError("Audio payload is too large.")

        return audio_bytes

    @staticmethod
    def _suffix_for_mime_type(mime_type: str) -> str:
        normalized_mime_type = mime_type.lower().split(";")[0].strip()
        suffixes = {
            "audio/mp4": ".m4a",
            "audio/mpeg": ".mp3",
            "audio/ogg": ".ogg",
            "audio/wav": ".wav",
            "audio/webm": ".webm",
            "audio/x-m4a": ".m4a",
        }

        if normalized_mime_type not in suffixes:
            raise SpeechInputError("Unsupported audio MIME type.")

        return suffixes[normalized_mime_type]

    @staticmethod
    def _collect_segments(segments: Iterable[object]) -> list[TranscriptSegment]:
        transcript_segments: list[TranscriptSegment] = []

        for segment in segments:
            transcript_segments.append(
                TranscriptSegment(
                    start=float(getattr(segment, "start")),
                    end=float(getattr(segment, "end")),
                    text=str(getattr(segment, "text")).strip(),
                ),
            )

        return transcript_segments
