import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred. Please try again.";
}

/**
 * A failure says what happened and what to do about it, in the court's own
 * register. It does not apologise and it does not hide the underlying message —
 * the student is often the one running the server.
 */
export function ApiErrorState({
  error,
  onRetry,
  title = "The record could not be loaded",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="record-entry border-l-stamp bg-stamp-wash/60 px-5 py-6">
      <p className="apparatus text-stamp">Not delivered</p>
      <h2 className="mt-2 font-serif text-xl">{title}</h2>
      <p className="mt-2 max-w-xl font-mono text-xs leading-relaxed text-muted-foreground">
        {getErrorMessage(error)}
      </p>
      {onRetry ? (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RotateCcw className="mr-2 h-4 w-4" /> Try again
        </Button>
      ) : null}
    </div>
  );
}
