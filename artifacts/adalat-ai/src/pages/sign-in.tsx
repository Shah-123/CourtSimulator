import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  useLogIn,
  useSignUp,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The door.
 *
 * Sign in and register are one form rather than two pages because they differ
 * by a single field, and a student arriving at a projector demo should not have
 * to find the other one.
 *
 * Errors are shown verbatim from the API. The login failure is deliberately the
 * same sentence for an unknown email and a wrong password — see the route — so
 * there is nothing here to soften or split into two messages.
 */
export default function SignInPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Both mutations settle by re-reading /auth/me rather than writing the
  // returned user into the cache. The cookie is what actually signs the student
  // in, and a cache primed from the response would show a signed-in shell if the
  // cookie failed to stick.
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });

  const logIn = useLogIn({ mutation: { onSuccess } });
  const signUp = useSignUp({ mutation: { onSuccess } });

  const pending = logIn.isPending || signUp.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const onError = (err: unknown) =>
      setError(
        (err as { data?: { error?: string } })?.data?.error ??
          "Something went wrong. Please try again.",
      );

    if (mode === "login") {
      logIn.mutate({ data: { email, password } }, { onError });
    } else {
      signUp.mutate({ data: { email, displayName, password } }, { onError });
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center pb-20 pt-12">
      <header className="masthead-rule pb-6">
        <p className="apparatus text-muted-foreground">
          {mode === "login" ? "Appearance" : "Enrolment"}
        </p>
        <h1 className="display-sm mt-2">
          {mode === "login" ? "Sign in" : "Register"}
        </h1>
        <p className="standfirst mt-3">
          Your sessions, marks and the judge's remarks on your advocacy are
          visible only to you.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        {mode === "register" && (
          <div className="space-y-2">
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              type="text"
              autoComplete="name"
              required
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <p className="apparatus text-muted-foreground">
              As it should appear on the record of proceedings.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            // Tells a password manager which flow this is; without it, a
            // manager offers to fill on the register form and to save on login.
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={mode === "register" ? 10 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === "register" && (
            <p className="apparatus text-muted-foreground">
              At least 10 characters. Length is the only rule.
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="border-l-2 border-stamp pl-3 font-serif text-[0.9375rem] text-foreground/90"
          >
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? "Working…"
            : mode === "login"
              ? "Sign in"
              : "Register and sign in"}
        </Button>
      </form>

      <p className="mt-6 border-t border-rule pt-6 text-center font-serif text-[0.9375rem] text-muted-foreground">
        {mode === "login" ? "No account yet? " : "Already registered? "}
        <button
          type="button"
          className="text-foreground underline underline-offset-4 hover:opacity-80"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Register" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
