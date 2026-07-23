from __future__ import annotations

from pydantic import BaseModel, Field


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(min_length=1)
    mime_type: str = Field(min_length=1, max_length=80)
    language: str | None = Field(default=None, min_length=2, max_length=12)


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    text: str
    language: str | None = None
    duration_ms: float
    segments: list[TranscriptSegment]


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4_000)
    voice: str | None = Field(default=None, min_length=1, max_length=64)
    response_format: str = Field(default="mp3", pattern="^(mp3|wav|opus)$")
