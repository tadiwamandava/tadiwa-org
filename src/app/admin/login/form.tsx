"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signInAction,
    null,
  );

  return (
    <form action={action} className="mt-8 max-w-sm">
      <label
        htmlFor="admin-password"
        className="block text-2xs tracking-wide text-subtle uppercase"
      >
        Password
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        className="mt-2 w-full rounded border border-border-strong bg-bg p-2.5 font-mono text-sm text-text outline-none focus-visible:border-accent"
      />

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>

      {/* aria-live so a screen reader hears the rejection; the message is
          deliberately identical for every failure mode. */}
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted">
        {state?.error}
      </p>
    </form>
  );
}
