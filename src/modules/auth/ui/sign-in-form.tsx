"use client";

import { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/modules/auth/auth-client";
import { Field, inputClass, primaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

type Mode = "sign-in" | "sign-up";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Incorrect email or password.",
  USER_ALREADY_EXISTS: "An account with this email already exists. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Sign in instead.",
  PASSWORD_TOO_SHORT: "The password must contain at least 10 characters.",
  INVALID_EMAIL: "Enter a valid email address.",
};

function describe(error: { code?: string; message?: string; status?: number } | null) {
  if (!error) {
    return "Could not sign in right now. Try again.";
  }
  if (error.status === 429) {
    return "Too many attempts. Wait a moment and try again.";
  }
  return (error.code && MESSAGES[error.code]) ?? error.message ?? "Could not sign in right now. Try again.";
}


export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password || (mode === "sign-up" && !name)) {
      setError(mode === "sign-up" ? "Enter your name, email and password." : "Enter your email and password.");
      return;
    }

    setPending(true);
    setError(null);

    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });

    if (result.error) {
      setError(describe(result.error));
      setPending(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  const signingUp = mode === "sign-up";

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {signingUp ? (
        <Field label="Name">
          <input
            aria-label="Name"
            name="name"
            autoComplete="name"
            required
            className={inputClass}
          />
        </Field>
      ) : null}
      <Field label="Email">
        <input
          aria-label="Email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className={inputClass}
        />
      </Field>
      <Field label="Password">
        <input
          aria-label="Password"
          name="password"
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
          minLength={signingUp ? 10 : undefined}
          className={inputClass}
        />
      </Field>

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`${primaryButtonClass} w-full`}
      >
        {pending ? <CircleNotchIcon aria-hidden="true" size={14} className="animate-spin" /> : null}
        {signingUp ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        {signingUp ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(signingUp ? "sign-in" : "sign-up");
            setError(null);
          }}
          className="font-medium text-primary outline-none hover:underline focus-visible:underline"
        >
          {signingUp ? "Sign in" : "Create account"}
        </button>
      </p>
    </form>
  );
}
