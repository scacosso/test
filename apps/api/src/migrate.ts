import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "./auth.js";
import { pool } from "./db.js";

if (!pool) throw new Error("DATABASE_URL is required to run migrations.");

const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migration = await readFile(join(directory, "001_initial.sql"), "utf8");
const client = await pool.connect();

try {
  await client.query("select pg_advisory_lock(hashtext('nexocam_migrations'))");
  if (auth) {
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  }
  await client.query("begin");
  await client.query(migration);
  await client.query("commit");
  console.info("NexoCam migrations are up to date.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.query("select pg_advisory_unlock(hashtext('nexocam_migrations'))");
  client.release();
  await pool.end();
}
