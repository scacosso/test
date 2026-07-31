import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync("docker-compose.easypanel.yml", "utf8");
const guestAuthMigration = readFileSync("apps/api/migrations/004_guest_auth.sql", "utf8");
const liveReviewMigration = readFileSync("apps/api/migrations/005_live_review_modes.sql", "utf8");
const generated = execFileSync(
  process.execPath,
  ["scripts/generate-easypanel-env.mjs", "app.nexocam.test", "livekit.nexocam.test"],
  { encoding: "utf8" }
);
const rotatedEvidenceKey = execFileSync(
  process.execPath,
  ["scripts/generate-evidence-key.mjs"],
  { encoding: "utf8" }
).trim().split("=", 2)[1];
const environment = Object.fromEntries(
  generated
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);

test("defines the complete EasyPanel service topology", () => {
  for (const service of ["app", "moderation", "postgres", "redis", "minio", "minio-init", "livekit"]) {
    assert.match(compose, new RegExp(`\\n  ${service}:\\r?\\n`));
  }
  for (const volume of ["postgres-data", "redis-data", "minio-data"]) {
    assert.match(compose, new RegExp(`\\n  ${volume}:\\r?\\n`));
  }
});

test("generates every environment value required by Compose", () => {
  const requiredKeys = [...compose.matchAll(/\$\{([A-Z0-9_]+):\?[^}]+\}/g)].map((match) => match[1]);
  for (const key of new Set(requiredKeys)) assert.ok(environment[key], `${key} must be generated`);
  assert.equal(environment.APP_URL, "https://app.nexocam.test");
  assert.equal(environment.LIVEKIT_PUBLIC_URL, "wss://livekit.nexocam.test");
  assert.ok(Object.hasOwn(environment, "SUPERUSER_EMAILS"));
});

test("refuses to generate deploy secrets with placeholder domains", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-easypanel-env.mjs"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /<app-host> <livekit-host>/);
});

test("generates correctly sized encryption and URL-safe infrastructure secrets", () => {
  assert.equal(Buffer.from(environment.EVIDENCE_ENCRYPTION_KEY, "base64").length, 32);
  assert.equal(Buffer.from(environment.BETTER_AUTH_SECRET, "base64").length, 32);
  assert.match(environment.EVIDENCE_ENCRYPTION_KEY, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(rotatedEvidenceKey, "base64url").length, 32);
  assert.match(rotatedEvidenceKey, /^[A-Za-z0-9_-]{43}$/);
  for (const key of ["POSTGRES_PASSWORD", "REDIS_PASSWORD", "LIVEKIT_API_SECRET", "S3_SECRET_KEY"]) {
    assert.match(environment[key], /^[a-f0-9]+$/);
  }
});

test("keeps the Better Auth user schema compatible with guest accounts", () => {
  assert.match(guestAuthMigration, /alter column "dateOfBirth" drop not null/i);
  assert.match(guestAuthMigration, /set "isAnonymous" = false/i);
  assert.match(guestAuthMigration, /alter column "isAnonymous" set default false/i);
  assert.match(guestAuthMigration, /alter column "isAnonymous" set not null/i);
});

test("persists live preview and interactive connection modes", () => {
  assert.match(liveReviewMigration, /add column if not exists mode text not null default 'observe'/i);
  assert.match(liveReviewMigration, /add column if not exists target_user_id text/i);
  assert.match(liveReviewMigration, /check \(mode in \('observe', 'connect'\)\)/i);
});
