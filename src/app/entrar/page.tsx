import { ChartDonutIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/modules/auth/session";
import { SignInForm } from "@/modules/auth/ui/sign-in-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};


function safeTarget(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/entrar") ? value : "/";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  const { para } = await searchParams;
  const target = safeTarget(para);

  if (await getSessionUser()) {
    redirect(target);
  }

  return (
    <main className="app-canvas grid min-h-[100dvh] place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="brand-mark grid size-11 place-items-center rounded-2xl text-primary-foreground">
            <ChartDonutIcon aria-hidden="true" size={22} weight="bold" />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-[-0.03em]">My Portfolio</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in to view your portfolio.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur">
          <SignInForm redirectTo={target} />
        </div>
      </div>
    </main>
  );
}
