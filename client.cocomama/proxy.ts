import { NextRequest, NextResponse } from "next/server";

const backendBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

const publicRoutes = new Set(["/login", "/signin"]);

type SessionResponse = {
  user?: {
    id?: string;
  };
};

type MeResponse = {
  user?: {
    onboardingCompleted?: boolean;
  };
};

function isPublicRoute(pathname: string) {
  return publicRoutes.has(pathname);
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (nextPath !== "/") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return loginUrl;
}

function buildOnboardingRedirect(request: NextRequest) {
  const onboardingUrl = new URL("/onboarding", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (nextPath !== "/" && !isPublicRoute(request.nextUrl.pathname)) {
    onboardingUrl.searchParams.set("next", nextPath);
  }

  return onboardingUrl;
}

async function getSession(request: NextRequest) {
  try {
    const response = await fetch(`${backendBaseUrl}/api/auth/get-session`, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json().catch(() => null)) as SessionResponse | null;
  } catch {
    return null;
  }
}

async function getMe(request: NextRequest) {
  try {
    const response = await fetch(`${backendBaseUrl}/api/app/me`, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json().catch(() => null)) as MeResponse | null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const session = await getSession(request);
  const isAuthenticated = Boolean(session?.user);
  const me = isAuthenticated ? await getMe(request) : null;
  const hasCompletedOnboarding = Boolean(me?.user?.onboardingCompleted);

  if (!isAuthenticated) {
    if (isPublicRoute(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    return NextResponse.redirect(buildLoginRedirect(request));
  }

  if (isPublicRoute(request.nextUrl.pathname)) {
    if (!hasCompletedOnboarding) {
      return NextResponse.redirect(buildOnboardingRedirect(request));
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!hasCompletedOnboarding && request.nextUrl.pathname !== "/onboarding") {
    return NextResponse.redirect(buildOnboardingRedirect(request));
  }

  if (hasCompletedOnboarding && request.nextUrl.pathname === "/onboarding") {
    const nextPath = request.nextUrl.searchParams.get("next");

    if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
