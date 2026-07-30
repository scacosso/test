import ws from "k6/ws";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    alpha: {
      executor: "constant-vus",
      vus: 100,
      duration: "2m"
    }
  },
  thresholds: {
    checks: ["rate>0.99"],
    ws_connecting: ["p(95)<5000"]
  }
};

export default function () {
  const base = __ENV.WS_URL || "ws://localhost:3001/ws/v1";
  const response = ws.connect(`${base}?user=load-${__VU}`, {}, (socket) => {
    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "queue.join",
        requestId: `join-${__VU}`,
        payload: { language: "es", country: __VU % 2 ? "AR" : "UY" },
        version: 1
      }));
    });
    socket.setInterval(() => socket.send(JSON.stringify({
      type: "heartbeat",
      requestId: `heartbeat-${__VU}-${Date.now()}`,
      payload: {},
      version: 1
    })), 5000);
    socket.setTimeout(() => socket.close(), 110000);
  });
  check(response, { "websocket upgraded": (result) => result?.status === 101 });
  sleep(1);
}
