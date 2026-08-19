import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="relative grid min-h-dvh place-items-center px-5 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "url(/washi.jpg)",
          backgroundSize: "420px",
        }}
      />
      <div className="relative w-full max-w-sm rounded-[var(--radius-xl)] bg-paper p-7 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <p className="font-display text-4xl leading-none">墨</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">Sign in to Sumi</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Keep a practice scroll of kanji you want to write again.
        </p>
        <div className="mt-6 space-y-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-ink-soft">Sign-in is disabled.</p>
          )}
        </div>
        <Link
          to="/"
          className="mt-6 inline-block text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          Back to the desk
        </Link>
      </div>
    </main>
  );
}
