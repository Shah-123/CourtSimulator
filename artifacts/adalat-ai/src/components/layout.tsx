import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Moon,
  Sun,
  BookOpen,
  Scale,
  ListOrdered,
  FileCheck2,
  PlayCircle,
  Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Case Library", icon: BookOpen },
  { href: "/dashboard", label: "Chambers", icon: Scale },
  { href: "/history", label: "Cause List", icon: ListOrdered },
  { href: "/evidence", label: "Statutes & Evid.", icon: FileCheck2 },
  { href: "/recorded", label: "Recorded Run", icon: PlayCircle },
];

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
      className="flex items-center justify-center h-9 w-9 rounded-sm border border-border/70 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground hover:border-primary/40 focus-visible:outline-ring"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-primary" />}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background selection:bg-primary/20 selection:text-primary">
      {/* Top Banner / Masthead */}
      <header className="sticky top-0 z-40 border-b border-rule bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 transition-colors">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
          {/* Brand & Wordmark */}
          <Link
            href="/"
            className="flex items-center gap-3 rounded-sm p-1 transition-opacity hover:opacity-90 group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/10 border border-primary/25 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200 shadow-sm">
              <span
                aria-hidden="true"
                className="wordmark-urdu text-2xl font-bold leading-none select-none"
              >
                عدالت
              </span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl font-bold tracking-tight text-foreground">
                  Adalat AI
                </span>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-mono uppercase tracking-wider text-primary border border-primary/20">
                  Moot Court
                </span>
              </div>
              <span className="apparatus text-[0.625rem] text-muted-foreground tracking-widest">
                Pakistan Superior Judiciary Simulation
              </span>
            </div>
          </Link>

          {/* Navigation Bar & Controls */}
          <div className="flex items-center gap-2 md:gap-3">
            <nav className="hidden sm:flex items-center gap-1 bg-secondary/40 p-1 rounded-sm border border-rule">
              {NAV.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-all duration-150",
                      isActive
                        ? "bg-card text-foreground font-semibold shadow-xs border border-rule text-primary"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <ThemeToggle />
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex sm:hidden overflow-x-auto border-t border-rule/60 px-4 py-1.5 gap-1 bg-secondary/20">
          {NAV.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-sm px-2.5 py-1 text-xs transition-colors",
                  isActive
                    ? "bg-card font-medium text-primary border border-rule"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>

      {/* Modern Judicial Footer */}
      <footer className="border-t border-rule bg-card/60 mt-auto text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-[1440px] flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Gavel className="h-3.5 w-3.5 text-primary" />
            <span className="apparatus">
              Pakistani Statutory Corpus Grounding: PPC 1860 · CrPC 1898 · QSO 1984 · Constitution 1973
            </span>
          </div>
          <div className="flex items-center gap-4 apparatus">
            <span className="text-seal flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-seal animate-pulse" />
              Statutes Verified
            </span>
            <span>Adalat AI © 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
