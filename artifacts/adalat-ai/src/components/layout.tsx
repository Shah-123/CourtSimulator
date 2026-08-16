import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Sun } from "lucide-react";
import { useLogOut } from "@workspace/api-client-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Case library" },
  { href: "/dashboard", label: "Chambers" },
  { href: "/history", label: "Cause list" },
  { href: "/evidence", label: "On the evidence" },
];

/**
 * Light or dark, remembered. Not a preference so much as a room control: this
 * is demonstrated on a projector, and whether the hall is lit decides which
 * one is legible from the back row.
 */
function ThemeToggle() {
  const [dark, setDark] = useState(
    () => localStorage.getItem("adalat-theme") === "dark",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("adalat-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((value) => !value)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded-sm p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/**
 * Who the record belongs to, and the way out.
 *
 * Renders nothing when signed out, so the same Layout wraps the sign-in page
 * without showing a name it does not have.
 *
 * Signing out clears the query cache and then reloads the page outright.
 *
 * Clearing alone was not enough and the failure was visible: the cookie went,
 * the sign-out control went, and the previous student's Chambers page stayed on
 * screen with their session still listed, because emptying the cache does not
 * reliably push already-mounted observers back through the auth gate. On a
 * shared university lab machine that is the exact leak this scoping exists to
 * prevent, so logout does not depend on cache semantics — the next student gets
 * a blank page and a fresh request.
 */
function SignedInAs() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const logOut = useLogOut({
    mutation: {
      onSettled: () => {
        queryClient.clear();
        window.location.assign(import.meta.env.BASE_URL || "/");
      },
    },
  });

  if (!user) return null;

  return (
    <div className="flex items-center gap-2 border-l border-rule pl-2">
      {/* Held back to the widest breakpoint and kept on one line: at tablet
          widths the name competed with the nav for the last of the row and
          both wrapped, splitting "Ayesha Khan" across two lines in the
          masthead. The sign-out control carries the meaning without it. */}
      <span className="apparatus hidden whitespace-nowrap text-muted-foreground lg:inline">
        {user.displayName}
      </span>
      <button
        type="button"
        onClick={() => logOut.mutate()}
        disabled={logOut.isPending}
        className="rounded-sm p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background selection:bg-primary/20 selection:text-primary">
      <header className="sticky top-0 z-40 border-b border-rule bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between md:gap-8 lg:px-8">
          <Link
            href="/"
            className="flex items-baseline gap-3 rounded-sm transition-opacity hover:opacity-80"
          >
            {/* The name of the thing, in the language of the court it models. */}
            <span
              aria-hidden="true"
              className="wordmark-urdu text-2xl text-primary"
            >
              عدالت
            </span>
            <span className="flex flex-col leading-none">
              {/* The name of the court is not a thing that wraps. */}
              <span className="whitespace-nowrap font-serif text-xl font-semibold tracking-tight">
                Adalat AI
              </span>
              <span className="apparatus mt-1 text-muted-foreground">
                Moot court
              </span>
            </span>
          </Link>

          <div className="flex items-center justify-between gap-1 md:justify-end md:gap-2">
            {/* Wraps on a narrow screen. A scrolling nav hides its own last
                item behind a scrollbar, which is where "Cause list" went. */}
            <nav className="flex flex-wrap items-center gap-1">
              {NAV.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "shrink-0 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <ThemeToggle />
            <SignedInAs />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
