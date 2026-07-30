# EasyPanel deployment

This guide targets one VPS with at least 8 vCPU and 16 GB RAM. Start with the hard application limit of 100 connected users and reduce it to the measured capacity if load testing fails.

## 1. Project and services

Create one EasyPanel project with these services:

| Service | Source / image | Exposure | Persistent volume |
|---|---|---|---|
| `app` | GitHub `scacosso/test`, branch `main`, root `Dockerfile` | generated HTTPS domain, container `3001` | none |
| `moderation` | same repository, `services/moderation/Dockerfile` | private health port `8081` | none |
| `postgres` | `postgres:17-alpine` | private `5432` | `/var/lib/postgresql/data` |
| `redis` | `redis:7-alpine` | private `6379` | `/data` |
| `minio` | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | private `9000`; console restricted | `/data` |
| `livekit` | `livekit/livekit-server:v1.13.4` | generated WSS domain on `7880`; ports below | config volume |

Add Mailpit only for staging. Production must use a transactional SMTP provider.

## 2. Domains and ports

Assign:

- `https://<generated-app-domain>` to `app:3001`.
- `wss://<generated-livekit-domain>` to `livekit:7880`.

Publish LiveKit media ports on the VPS firewall:

- `7881/tcp` — ICE/TCP fallback.
- `7882/udp` — multiplexed ICE/UDP.
- `3478/udp` — TURN/UDP.
- `50000-50100/udp` — TURN relay range configured in `infra/livekit/livekit.yaml`.

The generated domain does not enable TURN/TLS. Networks that only permit TLS on `443` may fail. A custom domain plus TURN/TLS is the planned compatibility upgrade.

If EasyPanel cannot publish UDP, run only LiveKit with Docker directly on the VPS:

```bash
docker run -d --name nexocam-livekit --restart unless-stopped \
  --network easypanel \
  -p 7880:7880/tcp -p 7881:7881/tcp -p 7882:7882/udp \
  -p 3478:3478/udp -p 50000-50100:50000-50100/udp \
  -v /opt/nexocam/livekit.yaml:/etc/livekit.yaml:ro \
  livekit/livekit-server:v1.13.4 --config /etc/livekit.yaml
```

Keep PostgreSQL, Redis, MinIO, the app, and moderation inside EasyPanel.

## 3. Variables

Copy every relevant key from `.env.example` into the app and moderation service. Replace all example secrets.

App-specific values:

```text
NODE_ENV=production
PORT=3001
APP_URL=https://<generated-app-domain>
ALLOWED_ORIGINS=https://<generated-app-domain>
DEMO_MODE=false
DATABASE_URL=postgresql://...
REDIS_URL=redis://redis:6379/0
LIVEKIT_URL=wss://<generated-livekit-domain>
S3_ENDPOINT=http://minio:9000
MAX_CONCURRENT_USERS=100
```

Moderation needs the same LiveKit, S3, encryption, and internal token secrets plus:

```text
API_INTERNAL_URL=http://app:3001
SAMPLE_SECONDS=3
MAX_CONCURRENT_INFERENCE=2
ONNX_THREADS=2
```

The LiveKit API key and secret must exactly match the `keys` entry in its config. Store `EVIDENCE_ENCRYPTION_KEY` outside MinIO and include it in encrypted backups; losing it makes evidence unrecoverable.

Google sign-in remains hidden until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are present. Add the Better Auth callback URL shown by the provider under the generated app domain. Configure SMTP to enable verification emails.

## 4. Startup and health checks

The app image runs Better Auth migrations and NexoCam SQL inside a PostgreSQL advisory lock before starting the API. This makes repeated deploys safe and avoids concurrent migration races.

Health checks:

- app liveness: `/health/live`
- app readiness: `/health/ready`
- moderation: `http://moderation:8081/metrics`
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- MinIO: `/minio/health/ready`

Deploy data services first, then LiveKit, app, and moderation. Enable GitHub autodeploy for `main` only after the first healthy manual deployment.

## 5. Volumes, lifecycle, and backups

- Snapshot PostgreSQL daily and retain at least seven daily plus four weekly copies.
- Snapshot MinIO daily. Server-side bucket lifecycle and the API cleanup both delete evidence after 30 days.
- Back up Redis only for faster recovery; PostgreSQL is the source of truth.
- Test restores monthly in a separate project.
- Restrict MinIO Console and PostgreSQL to the private network.
- Do not expose the internal moderation endpoints; they require `MODERATION_SERVICE_TOKEN` as a second boundary.

## 6. Capacity check

Run `k6 run tests/load/ws.js` from a host with network proximity to the VPS. Target 100 WebSocket connections and 50 rooms. Observe:

- API CPU and event-loop latency;
- Redis command latency;
- LiveKit participant/room counts and WebRTC connection P95;
- moderation inference queue and CPU.

Acceptance is WebRTC connection P95 below five seconds when a peer is available and no growing moderation backlog. If the VPS fails, lower `MAX_CONCURRENT_USERS` to the highest stable measured value before launch.

## 7. Launch checklist

- Professional review of `/terms` and `/privacy`.
- Google and SMTP credentials installed and email verification tested.
- Exact origin allowlist, secure cookies, and `DEMO_MODE=false`.
- UDP firewall rules verified from an external network.
- Two verified accounts complete a real call, text chat, next, report, and block flow.
- Moderator evidence access audited; no evidence exists for normal sessions.
- Backups and 30-day deletion verified.
