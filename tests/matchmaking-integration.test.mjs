import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { once } from "node:events";
import WebSocket from "ws";

async function availablePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  probe.close();
  await once(probe, "close");
  return port;
}

async function waitUntilReady(url, process) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`API exited early with code ${process.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the API");
}

function nextMessage(socket, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 5_000);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== type) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

test("two connected clients both receive the same match", async () => {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const api = spawn(process.execPath, ["apps/api/dist/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      APP_URL: origin,
      ALLOWED_ORIGINS: origin,
      DEMO_MODE: "true",
      DATABASE_URL: "",
      REDIS_URL: "",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logs = [];
  api.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  api.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  let left;
  let right;
  try {
    await waitUntilReady(`${origin}/health/live`, api);
    left = new WebSocket(`ws://127.0.0.1:${port}/ws/v1?user=integration-left`, { origin });
    right = new WebSocket(`ws://127.0.0.1:${port}/ws/v1?user=integration-right`, { origin });
    await Promise.all([once(left, "open"), once(right, "open")]);

    const leftMatch = nextMessage(left, "match.found");
    const rightMatch = nextMessage(right, "match.found");
    left.send(JSON.stringify({
      type: "queue.join",
      requestId: "left-join",
      payload: { language: "es", country: "AR" },
      version: 1
    }));
    right.send(JSON.stringify({
      type: "queue.join",
      requestId: "right-join",
      payload: { language: "es", country: "AR" },
      version: 1
    }));

    const [leftResult, rightResult] = await Promise.all([leftMatch, rightMatch]);
    assert.equal(leftResult.payload.sessionId, rightResult.payload.sessionId);
    assert.equal(leftResult.payload.peerId, "integration-right");
    assert.equal(rightResult.payload.peerId, "integration-left");
    assert.ok(leftResult.payload.token);
    assert.ok(rightResult.payload.token);
  } catch (error) {
    error.message += `\nAPI logs:\n${logs.join("")}`;
    throw error;
  } finally {
    left?.close();
    right?.close();
    if (api.exitCode === null) {
      const exited = once(api, "exit");
      api.kill();
      await exited.catch(() => undefined);
    }
  }
});
