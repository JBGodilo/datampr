"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const initialError = params.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  const supabase = createClient();

  const signInWithGoogle = async () => {
    setOauthLoading(true);
    setError(null);
    setInfo(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oauthError) {
      setError(oauthError.message);
      setOauthLoading(false);
    }
  };

  const submitEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setEmailLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        // Full reload so middleware sees the new session cookie.
        window.location.href = next.startsWith("/") ? next : "/";
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        // If email confirmation is enabled (the Supabase default), session is null.
        if (!data.session) {
          setInfo("Check your email for a confirmation link to finish creating your account.");
          setPassword("");
        } else {
          window.location.href = next.startsWith("/") ? next : "/";
        }
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError(null);
    setInfo(null);
  };

  const isSignin = mode === "signin";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        {isSignin && (
          <div className="mb-1 flex flex-col items-center">
            <span className="text-2xl font-extrabold italic tracking-tight">
              <span className="text-gray-900">DATA</span>
              <span className="text-emerald-500">MAPR</span>
            </span>
            <span className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-gray-400">
              CONNECT · MIGRATE · SCALE
            </span>
          </div>
        )}
        <CardTitle className="text-2xl">{isSignin ? "Sign in" : "Create your account"}</CardTitle>
        <CardDescription>
          {isSignin ? "Use Google or your email to continue." : "Use your email to register."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={signInWithGoogle}
          disabled={oauthLoading || emailLoading}
        >
          {oauthLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GoogleLogo className="mr-2 h-4 w-4" />
          )}
          Continue with Google
        </Button>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase text-muted-foreground">
            or
          </span>
        </div>

        <form onSubmit={submitEmail} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={emailLoading || oauthLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={isSignin ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isSignin ? undefined : 6}
              disabled={emailLoading || oauthLoading}
            />
            {!isSignin && <p className="text-xs text-muted-foreground">At least 6 characters.</p>}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={emailLoading || oauthLoading || !email.trim() || !password}
          >
            {emailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSignin ? "Sign in" : "Create account"}
          </Button>
        </form>

        {error && (
          <p className="text-center text-sm text-destructive">
            {error === "auth_callback_failed"
              ? "Sign-in failed. Please try again."
              : error === "missing_code"
                ? "Auth callback was missing a code. Please try again."
                : error}
          </p>
        )}
        {info && <p className="text-center text-sm text-muted-foreground">{info}</p>}

        <p className="text-center text-sm text-muted-foreground">
          {isSignin ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={toggleMode}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {isSignin ? "Sign up" : "Sign in"}
          </button>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-6">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.197l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
