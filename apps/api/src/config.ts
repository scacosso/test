const toList = (value: string | undefined, fallback: string[]) =>
  value?.split(",").map((item) => item.trim()).filter(Boolean) ?? fallback;

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  allowedOrigins: toList(process.env.ALLOWED_ORIGINS, ["http://localhost:5173"]),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  authSecret: process.env.BETTER_AUTH_SECRET ?? "development-only-change-me-development-only",
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  smtpUrl: process.env.SMTP_URL,
  emailFrom: process.env.EMAIL_FROM ?? "NexoCam <noreply@nexocam.local>",
  livekitUrl: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
  livekitApiKey: process.env.LIVEKIT_API_KEY,
  livekitApiSecret: process.env.LIVEKIT_API_SECRET,
  s3Endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3Bucket: process.env.S3_BUCKET ?? "nexocam-evidence",
  s3AccessKey: process.env.S3_ACCESS_KEY,
  s3SecretKey: process.env.S3_SECRET_KEY,
  evidenceEncryptionKey: process.env.EVIDENCE_ENCRYPTION_KEY,
  moderationServiceToken: process.env.MODERATION_SERVICE_TOKEN,
  demoMode: process.env.DEMO_MODE !== "false",
  maxConcurrentUsers: Number(process.env.MAX_CONCURRENT_USERS ?? 100)
};
