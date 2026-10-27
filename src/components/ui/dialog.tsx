"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertPrimitive from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * Accessible Dialog (focus trap, Escape to close, focus restore are handled by
 * Radix). On phones it is a full-screen sheet; from `md` up a centred dialog.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  side,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** "left" renders the mobile navigation drawer. */
  side?: "left";
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "fixed z-50 flex flex-col bg-white shadow-xl outline-none",
            side === "left"
              ? "inset-y-0 left-0 w-[85vw] max-w-[320px]"
              : "inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:w-full md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg",
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="text-base font-semibold text-slate-900">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="inline-flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          {description ? (
            <DialogPrimitive.Description className="px-4 pt-3 text-sm text-slate-600">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirmation dialog for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-[60] bg-slate-900/40" />
        <AlertPrimitive.Content className="fixed left-1/2 top-1/2 z-[70] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl">
          <AlertPrimitive.Title className="text-base font-semibold text-slate-900">{title}</AlertPrimitive.Title>
          <AlertPrimitive.Description className="mt-2 text-sm text-slate-600">{description}</AlertPrimitive.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertPrimitive.Cancel>
            <Button
              variant="danger"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
