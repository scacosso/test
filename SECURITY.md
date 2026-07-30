# Security policy

Report suspected vulnerabilities privately to `security@nexocam.example`. Do not include personal data or incident evidence in a public issue.

## Security boundaries

- Browser sessions use secure HTTP-only cookies in production and Better Auth's origin/CSRF controls.
- `/ws/v1` validates origins, payload envelopes, event names, and message sizes.
- LiveKit room tokens expire after five minutes and grant room-scoped camera, microphone, subscription, and data permissions.
- Normal calls and text are ephemeral. Incident evidence is AES-256-GCM encrypted before MinIO storage and removed after 30 days.
- Moderation evidence endpoints require both a moderator/admin session and an audited access path.
- Permanent suspensions require a human decision.

## Deployment requirements

Never deploy with example secrets, `DEMO_MODE=true`, wildcard origins, public databases, or a public MinIO bucket. Rotate the authentication, LiveKit, S3, encryption, and internal-service secrets after any suspected exposure.
