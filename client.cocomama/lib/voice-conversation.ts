export type VoiceConversationStatus =
  | "idle"
  | "listening"
  | "user_speaking"
  | "processing"
  | "ai_thinking"
  | "ai_speaking"
  | "tool_running"
  | "error"
  | "disconnected";

export const voiceStatusLabels: Record<VoiceConversationStatus, string> = {
  idle: "Idle",
  listening: "Listening",
  user_speaking: "User speaking",
  processing: "Processing",
  ai_thinking: "AI thinking",
  ai_speaking: "AI speaking",
  tool_running: "Tool running",
  error: "Error",
  disconnected: "Disconnected",
};

export type VoiceTranscriptionApiResponse = {
  ok: boolean;
  data?: {
    transcript: string;
    language?: string;
    durationMs?: number;
  };
  error?: {
    code: string;
    message: string;
  };
};

const recorderMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export function getPreferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    recorderMimeTypes.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? ""
  );
}

export async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    chunks.push(String.fromCharCode(...chunk));
  }

  return btoa(chunks.join(""));
}

export class VoicePlaybackController {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private rejectPlayback: ((error: Error) => void) | null = null;

  stop() {
    if (this.rejectPlayback) {
      const error = new Error("Audio playback stopped.");

      error.name = "AbortError";
      this.rejectPlayback(error);
      this.rejectPlayback = null;
    }

    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  async play(blob: Blob) {
    this.stop();

    const audio = new Audio();
    const objectUrl = URL.createObjectURL(blob);

    this.audio = audio;
    this.objectUrl = objectUrl;
    audio.src = objectUrl;
    audio.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);

        if (this.rejectPlayback === reject) {
          this.rejectPlayback = null;
        }
      };
      const handleEnded = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Audio playback failed."));
      };

      this.rejectPlayback = reject;
      audio.addEventListener("ended", handleEnded, { once: true });
      audio.addEventListener("error", handleError, { once: true });

      audio.play().catch((error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error("Audio failed."));
      });
    });

    this.stop();
  }

  async playResponse(response: Response) {
    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ??
      "audio/mpeg";

    if (
      !response.body ||
      typeof MediaSource === "undefined" ||
      !MediaSource.isTypeSupported(contentType)
    ) {
      await this.play(await response.blob());
      return;
    }

    this.stop();

    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    const audio = new Audio(objectUrl);

    this.audio = audio;
    this.objectUrl = objectUrl;

    const sourceBuffer = await new Promise<SourceBuffer>((resolve, reject) => {
      const cleanup = () => {
        mediaSource.removeEventListener("sourceopen", handleSourceOpen);
        mediaSource.removeEventListener("error", handleSourceError);

        if (this.rejectPlayback === reject) {
          this.rejectPlayback = null;
        }
      };
      const handleSourceOpen = () => {
        cleanup();
        resolve(mediaSource.addSourceBuffer(contentType));
      };
      const handleSourceError = () => {
        cleanup();
        reject(new Error("Audio stream failed to open."));
      };

      this.rejectPlayback = reject;
      mediaSource.addEventListener("sourceopen", handleSourceOpen, {
        once: true,
      });
      mediaSource.addEventListener("error", handleSourceError, { once: true });
    });

    const playbackEnded = new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);

        if (this.rejectPlayback === reject) {
          this.rejectPlayback = null;
        }
      };
      const handleEnded = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Audio playback failed."));
      };

      this.rejectPlayback = reject;
      audio.addEventListener("ended", handleEnded, { once: true });
      audio.addEventListener("error", handleError, { once: true });
    });

    const reader = response.body.getReader();

    audio.preload = "auto";
    await audio.play();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value.byteLength > 0) {
          await this.appendAudioChunk(sourceBuffer, value);
        }
      }

      await this.endMediaStream(mediaSource, sourceBuffer);
      await playbackEnded;
    } finally {
      reader.releaseLock();
      this.stop();
    }
  }

  private async appendAudioChunk(
    sourceBuffer: SourceBuffer,
    chunk: Uint8Array,
  ) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        sourceBuffer.removeEventListener("updateend", handleUpdateEnd);
        sourceBuffer.removeEventListener("error", handleError);
      };
      const handleUpdateEnd = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error("Audio stream append failed."));
      };
      const audioChunk = chunk.buffer.slice(
        chunk.byteOffset,
        chunk.byteOffset + chunk.byteLength,
      ) as ArrayBuffer;

      sourceBuffer.addEventListener("updateend", handleUpdateEnd, {
        once: true,
      });
      sourceBuffer.addEventListener("error", handleError, { once: true });
      sourceBuffer.appendBuffer(audioChunk);
    });
  }

  private async endMediaStream(
    mediaSource: MediaSource,
    sourceBuffer: SourceBuffer,
  ) {
    if (mediaSource.readyState !== "open") {
      return;
    }

    if (sourceBuffer.updating) {
      await new Promise<void>((resolve) => {
        sourceBuffer.addEventListener("updateend", () => resolve(), {
          once: true,
        });
      });
    }

    if (mediaSource.readyState === "open") {
      mediaSource.endOfStream();
    }
  }
}
