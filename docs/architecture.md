# Architecture

```mermaid
flowchart LR
  Browser["React client"] -->|HTTPS + secure cookie| API["Fastify + Better Auth"]
  Browser -->|WSS /ws/v1| API
  Browser <-->|WebRTC media + data| LK["Self-hosted LiveKit"]
  API --> PG[("PostgreSQL 17")]
  API --> Redis[("Redis 7 queues")]
  API -->|short room token| LK
  Mod["Python CPU moderator"] -->|invisible raw video subscription| LK
  Mod -->|incident frames only, encrypted| S3[("MinIO")]
  Mod -->|signed internal event| API
  API -->|last 20 messages only after incident| S3
  Admin["Moderator console"] -->|role-gated, audited| API
```

Each match receives a unique private LiveKit room. Two visible users can publish; the hidden moderation service is the only third participant. Queue entries begin with exact country and language, relax country at ten seconds, and remain same-language globally after thirty seconds. Atomic Redis claims and active-user keys prevent double matches.

The moderation window keeps five sampled frames (15 seconds at one frame every three seconds) in RAM. Normal windows disappear without persistence. A detection or report may retain at most three encrypted frames and twenty chat messages for 30 days.
