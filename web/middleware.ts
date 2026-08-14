import {
  NextResponse,
  type NextRequest
} from "next/server";

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate":
        'Basic realm="ETF Trader Dashboard", charset="UTF-8"'
    }
  });
}

function credentialsMatch(
  providedUser: string,
  providedPass: string,
  expectedUser: string,
  expectedPass: string
): boolean {
  const userOk =
    providedUser.length === expectedUser.length &&
    providedUser
      .split("")
      .every(
        (char, index) =>
          char === expectedUser[index]
      );
  const passOk =
    providedPass.length === expectedPass.length &&
    providedPass
      .split("")
      .every(
        (char, index) =>
          char === expectedPass[index]
      );

  return userOk && passOk;
}

export function middleware(
  request: NextRequest
): NextResponse {
  const expectedUser =
    process.env.DASHBOARD_BASIC_AUTH_USER;
  const expectedPass =
    process.env.DASHBOARD_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return NextResponse.next();
  }

  const authHeader =
    request.headers.get("authorization");

  if (
    !authHeader?.startsWith("Basic ")
  ) {
    return unauthorized();
  }

  let decoded: string;

  try {
    decoded = atob(
      authHeader.slice("Basic ".length)
    );
  } catch {
    return unauthorized();
  }

  const colonIndex = decoded.indexOf(":");

  if (colonIndex === -1) {
    return unauthorized();
  }

  const providedUser = decoded.slice(
    0,
    colonIndex
  );
  const providedPass = decoded.slice(
    colonIndex + 1
  );

  if (
    !credentialsMatch(
      providedUser,
      providedPass,
      expectedUser,
      expectedPass
    )
  ) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};
