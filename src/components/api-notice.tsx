"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";

/** Friendly inline error with an optional Retry button. */
export function ApiNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <Button variant="secondary" className="mt-2 min-h-11" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
