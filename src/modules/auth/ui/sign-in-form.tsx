"use client";

import { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/modules/auth/auth-client";
import { passwordPolicyError, PASSWORD_REQUIREMENTS, MAX_PASSWORD_LENGTH } from "../password-policy";
import { Field, inputClass, primaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) { setError("Enter your email and password."); return; }
    const issue = registering ? passwordPolicyError(password) : null;
    if (issue) { setError(issue); return; }
    setPending(true);
    setError(null);
    try {
      const result = registering
        ? await authClient.signUp.email({ email, password, name: email.split("@")[0] })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.status === 429
          ? "Too many attempts. Wait a moment and try again."
          : registering && result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "An account with this email already exists. Sign in instead."
          : registering ? "Could not create this account. Check your details or sign in if you already have an account."
          : "Incorrect email or password.");
        return;
      }
      if (registering) {
        element.reset();
        setRegistering(false);
        setCreated(true);
      } else {
        router.replace(redirectTo);
        router.refresh();
      }
    } catch {
      setError("Could not complete the request right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4" aria-label={registering ? "Create an Account" : "Sign In"}>
    {created ? <p role="status" className="text-sm text-primary">Account created. Sign in to start your empty portfolio.</p> : null}
    <Field label="Email"><input aria-label="Email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required disabled={pending} className={inputClass} /></Field>
    <Field label="Password"><input aria-label="Password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} maxLength={MAX_PASSWORD_LENGTH} required disabled={pending} aria-describedby={registering ? "password-requirements" : undefined} className={inputClass} /></Field>
    {registering ? <p id="password-requirements" className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS}</p> : null}
    {error ? <p role="alert" className="text-xs leading-relaxed text-destructive">{error}</p> : null}
    <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>
      {pending ? <CircleNotchIcon aria-hidden="true" size={14} className="animate-spin" /> : null}
      {registering ? "Create an Account" : "Sign In"}
    </button>
    <p className="text-center text-xs text-muted-foreground">
      {registering ? "Already have an account? " : "New here? "}
      <button type="button" disabled={pending} className="rounded text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => {
        setRegistering(!registering);
        setCreated(false);
        setError(null);
      }}>{registering ? "Sign In" : "Create an Account"}</button>
    </p>
  </form>;
}
