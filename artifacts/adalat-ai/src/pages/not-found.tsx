import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center">
      <p className="apparatus text-muted-foreground">No such page</p>
      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
        Nothing is listed at this address.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The page may have been renamed, or the link may be wrong.
      </p>
      <Link
        href="/"
        className="apparatus mt-6 text-primary underline underline-offset-4"
      >
        Case library
      </Link>
    </div>
  );
}
