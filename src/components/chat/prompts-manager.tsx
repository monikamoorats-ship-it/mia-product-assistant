"use client";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiNotice } from "../api-notice";
import { Button } from "../ui/button";
import { ConfirmDialog, Dialog } from "../ui/dialog";
import { ClientApiError, apiFetch } from "@/lib/client-api";
import { FIELD_LIMITS } from "@/lib/limits";

export type PersonaItem = { id: string; name: string; content: string; seeded: boolean; seedKey: string | null };

type Mode = { kind: "list" } | { kind: "form"; persona: PersonaItem | null };

export function PromptsManager({
  open,
  onOpenChange,
  personas,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personas: PersonaItem[];
  /** Called after any change; receives the ID of a deleted persona, if any. */
  onChanged: (deletedId?: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [deleting, setDeleting] = useState<PersonaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const custom = personas.filter((p) => !p.seeded);
  const seeded = personas.filter((p) => p.seeded);

  async function run(action: () => Promise<unknown>, deletedId?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged(deletedId);
      return true;
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function close(next: boolean) {
    if (!next) {
      setMode({ kind: "list" });
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={close}
        title="Manage Prompts"
        description="Seeded personas are read-only. Create your own, or duplicate a seeded persona and edit your copy. Custom personas use the Customer tone and are only visible in this browser profile."
      >
        {mode.kind === "form" ? (
          <PersonaForm
            persona={mode.persona}
            onCancel={() => setMode({ kind: "list" })}
            onSaved={async () => {
              setMode({ kind: "list" });
              await onChanged();
            }}
          />
        ) : (
          <div className="space-y-5">
            {error && <ApiNotice message={error} />}
            <section aria-labelledby="my-personas">
              <div className="flex items-center justify-between">
                <h3 id="my-personas" className="text-sm font-semibold text-slate-900">
                  My personas ({custom.length}/10)
                </h3>
                <Button onClick={() => setMode({ kind: "form", persona: null })}>
                  <Plus className="size-4" aria-hidden /> Add persona
                </Button>
              </div>
              {custom.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">You haven’t added any personas yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {custom.map((p) => (
                    <li key={p.id} className="flex items-center gap-1 p-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{p.name}</span>
                      <Button variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setMode({ kind: "form", persona: p })}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                        <Trash2 className="size-4 text-red-600" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="seeded-personas">
              <h3 id="seeded-personas" className="text-sm font-semibold text-slate-900">
                Seeded personas (read-only)
              </h3>
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {seeded.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 p-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                      <span className="block truncate text-xs text-slate-500">{p.content}</span>
                    </span>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      aria-label={`Duplicate ${p.name}`}
                      onClick={() => void run(() => apiFetch("/api/prompts", { method: "POST", body: { duplicateOf: p.id } }))}
                    >
                      <Copy className="size-4" aria-hidden /> Duplicate
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description="Chats using this persona will switch to the Customer tone. Earlier messages stay unchanged."
        confirmLabel="Delete persona"
        busy={busy}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          void run(() => apiFetch(`/api/prompts/${target.id}`, { method: "DELETE" }), target.id).then(() => setDeleting(null));
        }}
      />
    </>
  );
}

function PersonaForm({
  persona,
  onSaved,
  onCancel,
}: {
  persona: PersonaItem | null;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(persona?.name ?? "");
  const [content, setContent] = useState(persona?.content ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiFetch(persona ? `/api/prompts/${persona.id}` : "/api/prompts", {
        method: persona ? "PUT" : "POST",
        body: { name, content },
      });
      await onSaved();
    } catch (e) {
      if (e instanceof ClientApiError && e.fields) setFieldErrors(e.fields);
      else setError(e instanceof ClientApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <h3 className="text-sm font-semibold text-slate-900">{persona ? "Edit persona" : "Add a persona"}</h3>
      <div>
        <label htmlFor="persona-name" className="text-sm font-medium text-slate-800">
          Name <span aria-hidden>*</span>
        </label>
        <input
          id="persona-name"
          type="text"
          value={name}
          maxLength={FIELD_LIMITS.personaName + 20}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={fieldErrors.name ? true : undefined}
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-base text-slate-900 md:text-sm ${fieldErrors.name ? "border-red-400" : "border-slate-300"}`}
        />
        {fieldErrors.name && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {fieldErrors.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="persona-content" className="text-sm font-medium text-slate-800">
          Prompt <span aria-hidden>*</span>
        </label>
        <textarea
          id="persona-content"
          rows={5}
          value={content}
          maxLength={FIELD_LIMITS.personaContent + 100}
          onChange={(e) => setContent(e.target.value)}
          aria-invalid={fieldErrors.content ? true : undefined}
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-base text-slate-900 md:text-sm ${fieldErrors.content ? "border-red-400" : "border-slate-300"}`}
        />
        {fieldErrors.content && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {fieldErrors.content}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {content.length} / {FIELD_LIMITS.personaContent}
        </p>
      </div>
      {error && <ApiNotice message={error} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : persona ? "Save changes" : "Add persona"}
        </Button>
      </div>
    </form>
  );
}
