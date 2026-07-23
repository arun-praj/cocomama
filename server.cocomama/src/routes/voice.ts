import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth } from "../plugins/auth.js";

const audioMimeTypes = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

const transcribeRequestSchema = z
  .object({
    audioBase64: z.string().min(1),
    mimeType: z.string().min(1).max(80),
    language: z.string().min(2).max(12).optional(),
  })
  .strict();

const transcribeGatewayResponseSchema = z
  .object({
    text: z.string(),
    language: z.string().optional(),
    duration_ms: z.number().optional(),
  })
  .passthrough();

const ttsRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(4_000),
    voice: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeMimeType = (mimeType: string) =>
  mimeType.toLowerCase().split(";")[0]?.trim() ?? "";

const isSupportedAudioMimeType = (mimeType: string) =>
  audioMimeTypes.has(normalizeMimeType(mimeType));

const decodeAudio = (audioBase64: string) => {
  const candidate = audioBase64.includes(",")
    ? audioBase64.slice(audioBase64.indexOf(",") + 1)
    : audioBase64;
  const normalized = candidate.replace(/\s/g, "");

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return null;
  }

  const audio = Buffer.from(normalized, "base64");

  if (!audio.length || audio.byteLength > env.VOICE_MAX_AUDIO_BYTES) {
    return null;
  }

  return audio;
};

const createGatewayAbort = (request: FastifyRequest) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, env.VOICE_GATEWAY_TIMEOUT_MS);
  const abort = () => {
    controller.abort();
  };

  request.raw.once("aborted", abort);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      request.raw.removeListener("aborted", abort);
    },
  };
};

const readGatewayError = async (response: Response) =>
  (await response.text().catch(() => "Speech gateway request failed")).slice(
    0,
    600,
  );

const voiceGatewayBaseUrl = () => trimTrailingSlash(env.VOICE_GATEWAY_BASE_URL);

const gatewayUnreachableMessage = () =>
  `Speech gateway could not be reached. Start the voice gateway service at ${voiceGatewayBaseUrl()} or update VOICE_GATEWAY_BASE_URL.`;

export const voiceRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/api/voice/transcribe",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = transcribeRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "validation_error",
            message: "Invalid voice transcription request",
            details: parsed.error.flatten(),
          },
        });
      }

      if (!isSupportedAudioMimeType(parsed.data.mimeType)) {
        return reply.code(415).send({
          ok: false,
          error: {
            code: "unsupported_audio_type",
            message: "Audio must be webm, ogg, wav, mp3, mp4, or m4a.",
          },
        });
      }

      const audio = decodeAudio(parsed.data.audioBase64);

      if (!audio) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "invalid_audio",
            message: "Audio was empty, malformed, or too large.",
          },
        });
      }

      const gatewayAbort = createGatewayAbort(request);

      try {
        const response = await fetch(
          `${voiceGatewayBaseUrl()}/v1/stt/transcribe`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              audio_base64: audio.toString("base64"),
              mime_type: normalizeMimeType(parsed.data.mimeType),
              ...(parsed.data.language
                ? { language: parsed.data.language }
                : {}),
            }),
            signal: gatewayAbort.signal,
          },
        );

        if (!response.ok) {
          return reply.code(502).send({
            ok: false,
            error: {
              code: "speech_gateway_error",
              message: await readGatewayError(response),
            },
          });
        }

        const gatewayBody = transcribeGatewayResponseSchema.safeParse(
          await response.json().catch(() => null),
        );

        if (!gatewayBody.success) {
          return reply.code(502).send({
            ok: false,
            error: {
              code: "bad_speech_gateway_response",
              message:
                "Speech gateway returned an invalid transcription response.",
            },
          });
        }

        return reply.code(200).send({
          ok: true,
          data: {
            transcript: gatewayBody.data.text.trim(),
            ...(gatewayBody.data.language
              ? { language: gatewayBody.data.language }
              : {}),
            ...(gatewayBody.data.duration_ms
              ? { durationMs: gatewayBody.data.duration_ms }
              : {}),
          },
        });
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";

        return reply.code(isAbort ? 504 : 502).send({
          ok: false,
          error: {
            code: isAbort ? "speech_gateway_timeout" : "speech_gateway_error",
            message: isAbort
              ? "Speech gateway timed out."
              : gatewayUnreachableMessage(),
          },
        });
      } finally {
        gatewayAbort.cleanup();
      }
    },
  );

  app.post(
    "/api/voice/tts",
    {
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = ttsRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: "validation_error",
            message: "Invalid text-to-speech request",
            details: parsed.error.flatten(),
          },
        });
      }

      const gatewayAbort = createGatewayAbort(request);

      try {
        const response = await fetch(`${voiceGatewayBaseUrl()}/v1/tts/stream`, {
          method: "POST",
          headers: {
            accept: "audio/mpeg",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            text: parsed.data.text,
            voice: parsed.data.voice ?? env.VOICE_TTS_DEFAULT_VOICE,
            response_format: "mp3",
          }),
          signal: gatewayAbort.signal,
        });

        if (!response.ok || !response.body) {
          return reply.code(502).send({
            ok: false,
            error: {
              code: "speech_gateway_error",
              message: await readGatewayError(response),
            },
          });
        }

        reply.header(
          "content-type",
          response.headers.get("content-type") ?? "audio/mpeg",
        );
        reply.header("cache-control", "no-store");

        return reply.send(Readable.fromWeb(response.body));
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";

        return reply.code(isAbort ? 504 : 502).send({
          ok: false,
          error: {
            code: isAbort ? "speech_gateway_timeout" : "speech_gateway_error",
            message: isAbort
              ? "Speech gateway timed out."
              : gatewayUnreachableMessage(),
          },
        });
      } finally {
        gatewayAbort.cleanup();
      }
    },
  );
};
