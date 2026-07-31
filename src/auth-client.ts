export type BrowserSession = {
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: "user" | "moderator" | "admin" | "superuser";
    isAnonymous?: boolean;
  };
} | null;

export async function getBrowserSession(): Promise<BrowserSession> {
  const response = await fetch("/api/auth/get-session", {
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" }
  });
  if (!response.ok) return null;
  return response.json() as Promise<BrowserSession>;
}

export async function hasActiveSession() {
  const session = await getBrowserSession();
  return Boolean(session?.user?.id);
}

export async function signOutBrowserSession() {
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: "{}"
  });
  if (!response.ok) throw new Error("Sign out failed.");
  if (await hasActiveSession()) throw new Error("Session remained active after sign out.");
}
