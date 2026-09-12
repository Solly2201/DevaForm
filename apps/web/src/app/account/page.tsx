"use client";

/**
 * Account page — first-party sign in / sign up. Guests can use all of
 * DevaForm without an account; signing up claims the current session's
 * creations so nothing is lost.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchCurrentUser, login, logout, signup, type AuthUser } from "@/lib/authApi";
import { SiteNav } from "@/components/site/SiteNav";

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const nextUser =
        mode === "signup"
          ? await signup(email, password, name || undefined)
          : await login(email, password);
      setUser(nextUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logout();
      setUser(null);
      setEmail("");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-surface-950 text-stone-200">
      <SiteNav />
      <main className="mx-auto max-w-md px-6 py-14">
        {user === undefined && <p className="text-sm text-stone-500">Loading…</p>}

        {user && (
          <div className="rounded-2xl border border-surface-800 bg-surface-900 p-6">
            <h1 className="font-display text-2xl text-stone-100">Your Account</h1>
            <p className="mt-3 text-sm text-stone-300">
              Signed in as <span className="text-saffron-400">{user.email}</span>
              {user.name ? ` (${user.name})` : ""}
            </p>
            <p className="mt-2 text-xs text-stone-500">
              Your creations are saved to this account and available wherever you sign in.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                href="/library"
                className="rounded-xl bg-saffron-500 px-4 py-2 text-sm font-semibold text-surface-950 hover:bg-saffron-400"
              >
                Your Library
              </Link>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={busy}
                className="rounded-xl border border-surface-700 px-4 py-2 text-sm text-stone-300 hover:border-stone-500 disabled:opacity-50"
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {user === null && (
          <div className="rounded-2xl border border-surface-800 bg-surface-900 p-6">
            <h1 className="font-display text-2xl text-stone-100">
              {mode === "login" ? "Sign in" : "Create your account"}
            </h1>
            <p className="mt-2 text-xs text-stone-500">
              {mode === "signup"
                ? "Creations you made as a guest are kept and claimed by your new account."
                : "Welcome back to DevaForm."}
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              {mode === "signup" && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name (optional)"
                  aria-label="Name"
                  className="w-full rounded-lg border border-surface-700 bg-surface-850 px-3 py-2 text-sm text-stone-200 focus:border-saffron-600 focus:outline-none"
                />
              )}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                aria-label="Email"
                className="w-full rounded-lg border border-surface-700 bg-surface-850 px-3 py-2 text-sm text-stone-200 focus:border-saffron-600 focus:outline-none"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 8 characters)"
                aria-label="Password"
                className="w-full rounded-lg border border-surface-700 bg-surface-850 px-3 py-2 text-sm text-stone-200 focus:border-saffron-600 focus:outline-none"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-saffron-500 px-4 py-2.5 text-sm font-semibold text-surface-950 hover:bg-saffron-400 disabled:opacity-50"
              >
                {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
              className="mt-4 text-xs text-stone-400 underline-offset-2 hover:text-saffron-400 hover:underline"
            >
              {mode === "login"
                ? "New to DevaForm? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
