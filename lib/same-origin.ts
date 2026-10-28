const PRODUCTION_ORIGIN = "https://icenter-store.com";

function parseOrigin(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin === "null") return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function sameOrigin(request: Pick<Request, "url" | "headers">) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const parsedOrigin = parseOrigin(origin);
  if (!parsedOrigin) return false;

  // Local production-style `next start` instances (for example port 3022) still
  // run with NODE_ENV=production. They may opt in explicitly to loopback origins
  // without weakening the canonical-origin rule used by real production traffic.
  if (process.env.ICENTER_LOCAL_DEV === "1") {
    const requestOrigin = new URL(request.url).origin;
    const requestUrl = new URL(request.url);
    const localHost = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1" || requestUrl.hostname === "[::1]";
    if (localHost && parsedOrigin === requestOrigin) return true;
  }

  // The production proxy may give Next.js an internal URL; trust only the canonical public origin.
  if (process.env.NODE_ENV === "production") return parsedOrigin === PRODUCTION_ORIGIN;

  if (process.env.NODE_ENV === "development") {
    return parsedOrigin === parseOrigin(new URL(request.url).origin);
  }

  return false;
}
