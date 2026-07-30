import { describe, expect, it, vi } from "vitest";
import { forwardAuthResponseHeaders } from "./auth-response.js";

describe("forwardAuthResponseHeaders", () => {
  it("forwards every Set-Cookie header separately", () => {
    const headers = new Headers({
      "content-type": "application/json",
      "content-length": "42"
    });
    headers.append("set-cookie", "session=one; Path=/; HttpOnly; Secure; SameSite=Lax");
    headers.append("set-cookie", "session_data=two; Path=/; HttpOnly; Secure; SameSite=Lax");
    const response = new Response("{}", { headers });
    const header = vi.fn();

    forwardAuthResponseHeaders({ header }, response);

    expect(header).toHaveBeenCalledWith("content-type", "application/json");
    expect(header).not.toHaveBeenCalledWith("content-length", expect.anything());
    expect(header).toHaveBeenCalledWith("set-cookie", [
      "session=one; Path=/; HttpOnly; Secure; SameSite=Lax",
      "session_data=two; Path=/; HttpOnly; Secure; SameSite=Lax"
    ]);
  });
});
