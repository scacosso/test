# NexoCam

NexoCam is an original, bilingual (Spanish/English), adults-only random video-chat alpha. It includes:

- email/password accounts, adult guest sessions, and optional Google OAuth through Better Auth;
- country/language matchmaking with Redis-backed atomic claims;
- private two-person LiveKit rooms, text chat, reconnect, next, report, and block;
- incident-only encrypted evidence, 30-day deletion, and a moderator console;
- a CPU-only Python moderation worker using `opennsfw-onnx`;
- PostgreSQL 17, Redis 7, MinIO, Mailpit, Docker, and an EasyPanel deployment guide.

Calls are not recorded. WebRTC/TLS encrypts transport, but proactive moderation means calls are not end-to-end encrypted.

## Local development

Requires Node.js 24+, Docker, and Docker Compose.

```bash
cp .env.example .env
npm install
npm run dev
npm run dev:api
```

The frontend is at `http://localhost:5173`. With `DEMO_MODE=true`, the main experience can be inspected without infrastructure. For the full stack:

```bash
docker compose up --build
```

Then open `http://localhost:3001`; Mailpit is at `http://localhost:8025` and MinIO Console at `http://localhost:9001`.

Generate production secrets before deployment:

```bash
npm run easypanel:env -- app.example.com livekit.example.com
```

For a single EasyPanel Compose deployment, select
`docker-compose.easypanel.yml` from the repository. It builds the two NexoCam
images and creates PostgreSQL, Redis, MinIO, the evidence bucket, and LiveKit.

## Quality gates

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The visual acceptance reference is [`design/reference-nexocam-option-1.png`](design/reference-nexocam-option-1.png). Deployment instructions are in [`EASYPANEL.md`](EASYPANEL.md).

## Important alpha limits

- Only people aged 18+ may register or enter as guests. Registered accounts provide a date of birth; guests provide an explicit adult attestation. This alpha does not perform document verification.
- Google OAuth and real email delivery are enabled only when credentials are configured.
- Email verification is disabled for the current alpha. Registration, guest access, verification, reporting, moderation, and monitoring are stored as feature flags for a future superuser panel.
- A generated EasyPanel domain supports WSS plus ICE/TCP and ICE/UDP, but not TURN/TLS on port 443. Some restrictive networks will need a future custom domain and TURN/TLS configuration.
- Legal copy is a technical draft and requires professional review before public launch.
