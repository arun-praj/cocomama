import { NextRequest } from "next/server";

const backendBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

const bodylessMethods = new Set(["GET", "HEAD"]);

function cleanProxyHeaders(headers: Headers) {
  for (const headerName of [
    "connection",
    "content-length",
    "expect",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    headers.delete(headerName);
  }

  return headers;
}

function getSetCookieHeaders(headers: Headers) {
  return (
    (
      headers as Headers & {
        getSetCookie?: () => string[];
      }
    ).getSetCookie?.() ?? []
  );
}

function copyResponseHeaders(response: Response) {
  const headers = cleanProxyHeaders(new Headers(response.headers));

  headers.delete("set-cookie");

  for (const cookie of getSetCookieHeaders(response.headers)) {
    headers.append("set-cookie", cookie);
  }

  return headers;
}

async function proxyVoiceRequest(request: NextRequest) {
  const url = new URL(request.url);
  const voicePath = url.pathname.replace(/^\/api\/voice/, "");
  const targetUrl = `${backendBaseUrl}/api/voice${voicePath}${url.search}`;
  const headers = cleanProxyHeaders(new Headers(request.headers));

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    redirect: "manual",
    body: bodylessMethods.has(request.method)
      ? undefined
      : await request.arrayBuffer(),
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyResponseHeaders(response),
  });
}

export const POST = proxyVoiceRequest;
