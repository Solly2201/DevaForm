/** Client API for first-party auth. */

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const fetchCurrentUser = () =>
  request<{ user: AuthUser | null }>("/api/auth/me").then((r) => r.user);

export const signup = (email: string, password: string, name?: string) =>
  request<{ user: AuthUser }>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  }).then((r) => r.user);

export const login = (email: string, password: string) =>
  request<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }).then((r) => r.user);

export const logout = () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
