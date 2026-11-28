import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";

export function readBasicAuthPassword(
  environment: Record<string, string | undefined>,
): string | undefined {
  return environment.DEMO_BASIC_AUTH_PASSWORD;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Hashing first gives equal-length buffers, so the comparison takes the same time whatever was sent.
function sameSecret(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

// Reviewers get only a password, so whatever username the browser sends is ignored.
function sentPassword(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  const encoded = /^Basic (?<encoded>.+)$/iu.exec(header ?? "")?.groups?.encoded;

  if (encoded === undefined) {
    return undefined;
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separator = decoded.indexOf(":");

  return separator === -1 ? undefined : decoded.slice(separator + 1);
}

/** The 401 challenge for a request without the expected password, or nothing to let it through. */
export function rejectWithoutBasicAuth(
  request: Request,
  password: string | undefined,
): Response | undefined {
  if (password === undefined) {
    return undefined;
  }

  const sent = sentPassword(request);

  if (sent !== undefined && sameSecret(sent, password)) {
    return undefined;
  }

  return new globalThis.Response("Authentication required", {
    headers: { "www-authenticate": 'Basic realm="Slopstagram demo", charset="UTF-8"' },
    status: 401,
  });
}
