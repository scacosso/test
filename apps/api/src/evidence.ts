import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config.js";
import { pool } from "./db.js";
import { decodeEvidenceKey } from "./evidence-key.js";

const s3 = config.s3AccessKey && config.s3SecretKey
  ? new S3Client({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.s3AccessKey, secretAccessKey: config.s3SecretKey }
    })
  : null;

function keyMaterial() {
  if (!config.evidenceEncryptionKey) return null;
  return decodeEvidenceKey(config.evidenceEncryptionKey);
}

export async function storeEncryptedChat(
  eventId: string,
  sessionId: string,
  messages: { userId: string; text: string; at: string }[]
) {
  const key = keyMaterial();
  if (!s3 || !pool || !key || messages.length === 0) return;
  const plaintext = Buffer.from(JSON.stringify(messages.slice(-20)));
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const body = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  const objectKey = `incidents/${sessionId}/${randomUUID()}.chat.enc`;
  await s3.send(new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: objectKey,
    Body: body,
    ContentType: "application/octet-stream",
    Metadata: { retention: "30-days", encryption: "aes-256-gcm" }
  }));
  await pool.query(
    `insert into evidence (moderation_event_id, object_key, media_type, sha256, encrypted_key)
     values ($1, $2, 'chat', $3, 'env:EVIDENCE_ENCRYPTION_KEY')`,
    [eventId, objectKey, createHash("sha256").update(body).digest("hex")]
  );
}

export async function readEncryptedEvidence(evidenceId: string, actorId: string) {
  const key = keyMaterial();
  if (!s3 || !pool || !key) return null;
  const result = await pool.query<{
    object_key: string;
    media_type: "image" | "chat";
    session_id: string;
  }>(
    `select e.object_key, e.media_type, coalesce(r.session_id, me.session_id) as session_id
     from evidence e
     left join reports r on r.id = e.report_id
     left join moderation_events me on me.id = e.moderation_event_id
     where e.id = $1 and e.expires_at > now()`,
    [evidenceId]
  );
  const item = result.rows[0];
  if (!item) return null;
  const object = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: item.object_key }));
  if (!object.Body) return null;
  const encrypted = Buffer.from(await object.Body.transformToByteArray());
  const nonce = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  if (item.media_type === "image") decipher.setAAD(Buffer.from(item.session_id));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  await pool.query(
    `insert into audit_log (actor_id, action, target_type, target_id)
     values ($1, 'evidence.view', 'evidence', $2)`,
    [actorId, evidenceId]
  );
  return {
    body: plaintext,
    contentType: item.media_type === "image" ? "image/jpeg" : "application/json"
  };
}

export async function healthEvidenceStore() {
  if (!s3) return { healthy: false, configured: false, latencyMs: null };
  const startedAt = performance.now();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
    return {
      healthy: true,
      configured: true,
      latencyMs: Math.round(performance.now() - startedAt)
    };
  } catch {
    return {
      healthy: false,
      configured: true,
      latencyMs: Math.round(performance.now() - startedAt)
    };
  }
}
