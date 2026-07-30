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
  response: Response
) {
  response.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "set-cookie" || hopByHopHeaders.has(normalizedKey)) return;
    reply.header(key, value);
  });

  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
}
