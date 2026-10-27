"use client";

import { useRouter } from "next/navigation";
import { ApiNotice } from "./api-notice";

/** Friendly full-panel error shown when a page cannot reach the database. */
export function DbUnavailable() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md p-6">
      <ApiNotice
        message="Mia can’t reach the database right now. Please try again in a moment."
        onRetry={() => router.refresh()}
      />
    </div>
  );
}
