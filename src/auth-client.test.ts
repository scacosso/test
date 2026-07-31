import { afterEach, describe, expect, it, vi } from "vitest";
import { signOutBrowserSession } from "./auth-client";

afterEach(() => vi.unstubAllGlobals());

describe("browser sign out", () => {
  it("only succeeds after the session is actually gone", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(signOutBrowserSession()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/sign-out", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: "{}"
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/get-session", expect.objectContaining({
      cache: "no-store",
      credentials: "include"
    }));
  });

  it("reports a failure when the cookie still exposes a user", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "still-signed-in" } }), { status: 200 })));

    await expect(signOutBrowserSession()).rejects.toThrow("Session remained active");
  });
});
