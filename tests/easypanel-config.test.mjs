import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync("docker-compose.easypanel.yml", "utf8");
const generated = execFileSync(
  process.execPath,
  ["scripts/generate-easypanel-env.mjs", "app.nexocam.test", "livekit.nexocam.test"],
  { encoding: "utf8" }
);
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
});

test("generates correctly sized encryption and URL-safe infrastructure secrets", () => {
  assert.equal(Buffer.from(environment.EVIDENCE_ENCRYPTION_KEY, "base64").length, 32);
  assert.equal(Buffer.from(environment.BETTER_AUTH_SECRET, "base64").length, 32);
  for (const key of ["POSTGRES_PASSWORD", "REDIS_PASSWORD", "LIVEKIT_API_SECRET", "S3_SECRET_KEY"]) {
    assert.match(environment[key], /^[a-f0-9]+$/);
  }
});
