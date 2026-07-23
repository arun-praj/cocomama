import { NextRequest, NextResponse } from "next/server";

const backendBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  try {
    const response = await fetch(`${backendBaseUrl}/api/chat`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);

    return NextResponse.json(
      data ?? {
        ok: false,
        error: {
          code: "bad_backend_response",
          message: "Chat backend returned an empty response",
        },
      },
      { status: response.status },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "chat_backend_unreachable",
          message: "Could not reach the chat backend",
        },
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const chatPath = url.pathname.replace(/^\/api\/chat/, "");

  try {
    const response = await fetch(
      `${backendBaseUrl}/api/chat${chatPath}${url.search}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          cookie: request.headers.get("cookie") ?? "",
        },
        redirect: "manual",
      },
    );
    const data = await response.json().catch(() => null);

    return NextResponse.json(
      data ?? {
        ok: false,
        error: {
          code: "bad_backend_response",
          message: "Chat backend returned an empty response",
        },
      },
      { status: response.status },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "chat_backend_unreachable",
          message: "Could not reach the chat backend",
        },
      },
      { status: 502 },
    );
  }
}
