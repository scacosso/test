import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config.js";
import { pool } from "./db.js";

export const isExpired = (expiresAt: Date, now = new Date()) => expiresAt.getTime() <= now.getTime();

export async function purgeExpiredEvidence() {
  if (!pool || !config.s3AccessKey || !config.s3SecretKey) return 0;
  const result = await pool.query<{ id: string; object_key: string }>(
    "select id, object_key from evidence where expires_at <= now() order by expires_at limit 1000"
  );
  if (result.rows.length === 0) return 0;
  const s3 = new S3Client({
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.s3AccessKey, secretAccessKey: config.s3SecretKey }
  });
  await s3.send(new DeleteObjectsCommand({
    Bucket: config.s3Bucket,
    Delete: { Objects: result.rows.map((row) => ({ Key: row.object_key })), Quiet: true }
  }));
  await pool.query("delete from evidence where id = any($1::uuid[])", [result.rows.map((row) => row.id)]);
  return result.rows.length;
}
