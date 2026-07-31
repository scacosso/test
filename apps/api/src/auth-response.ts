import type { FastifyReply } from "fastify";

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

export function forwardAuthResponseHeaders(
  reply: Pick<FastifyReply, "header">,
  response: Response,
  options: { clearSessionCookies?: boolean; secureCookies?: boolean } = {}
) {
  response.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "set-cookie" || hopByHopHeaders.has(normalizedKey)) return;
    reply.header(key, value);
  });

  const cookies = response.headers.getSetCookie();
  if (options.clearSessionCookies) {
    const secure = options.secureCookies ? "; Secure" : "";
    const expired = "Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";
    for (const name of [
      "better-auth.session_token",
      "__Secure-better-auth.session_token",
      "better-auth.session_data",
      "__Secure-better-auth.session_data",
      "better-auth.dont_remember",
      "__Secure-better-auth.dont_remember"
    ]) {
      cookies.push(`${name}=; ${expired}${secure}`);
    }
  }
  if (cookies.length > 0) reply.header("set-cookie", cookies);
}
