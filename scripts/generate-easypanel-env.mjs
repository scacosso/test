import { randomBytes } from "node:crypto";

const appHost = process.argv[2];
const livekitHost = process.argv[3];
const hex = (bytes) => randomBytes(bytes).toString("hex");
const base64Key = () => randomBytes(32).toString("base64");
const base64UrlKey = () => randomBytes(32).toString("base64url");

if (!appHost || !livekitHost) {
  throw new Error("Usage: npm run easypanel:env -- <app-host> <livekit-host>");
}

if (!/^[a-z0-9.-]+$/i.test(appHost) || !/^[a-z0-9.-]+$/i.test(livekitHost)) {
  throw new Error("Pass hostnames only, without https://, paths, or trailing slashes.");
}

const values = {
  APP_URL: `https://${appHost}`,
  LIVEKIT_PUBLIC_URL: `wss://${livekitHost}`,
  POSTGRES_DB: "nexocam",
  POSTGRES_USER: "nexocam",
  POSTGRES_PASSWORD: hex(24),
  REDIS_PASSWORD: hex(24),
  BETTER_AUTH_SECRET: base64Key(),
  LIVEKIT_API_KEY: `nexocam_${hex(8)}`,
  LIVEKIT_API_SECRET: hex(32),
  S3_REGION: "us-east-1",
  S3_BUCKET: "nexocam-evidence",
  S3_ACCESS_KEY: `nexocam${hex(4)}`,
  S3_SECRET_KEY: hex(32),
  EVIDENCE_ENCRYPTION_KEY: base64UrlKey(),
  MODERATION_SERVICE_TOKEN: hex(32),
  MAX_CONCURRENT_USERS: "100",
  SAMPLE_SECONDS: "3",
  NSFW_WARNING_THRESHOLD: "0.68",
  NSFW_STRONG_THRESHOLD: "0.88",
  MAX_CONCURRENT_INFERENCE: "2",
  ONNX_THREADS: "2",
  SMTP_URL: "",
  EMAIL_FROM: `NexoCam <noreply@${appHost}>`,
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: ""
};

console.log("# Generated once for the NexoCam EasyPanel Compose service.");
console.log("# Store this output in a password manager and never commit real values.");
for (const [key, value] of Object.entries(values)) console.log(`${key}=${value}`);
