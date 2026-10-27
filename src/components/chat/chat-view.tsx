"use client";

import { Paperclip, Send, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiNotice } from "../api-notice";
import { Button, iconButtonClass } from "../ui/button";
import { ConfirmDialog } from "../ui/dialog";
import { ProductCard } from "./product-card";
import { SIMULATION_NOTE, SettingsDialog } from "./settings-dialog";
import { ClientApiError, apiFetch, formatTime, notifyChatsChanged } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { FIELD_LIMITS } from "@/lib/limits";
import { CHAT_MODELS, MODEL_LABELS, DEFAULT_SETTINGS, type ChatModelValue } from "@/lib/validation";
import type { ChatDTO, MessageDTO } from "@/server/chats";

type Persona = { id: string; name: string; seeded: boolean; seedKey: string | null };

const EXAMPLES = [
  "What helps with hay fever?",
  "How should I take ibuprofen?",
  "Which products contain paracetamol?",
  "Which product is used for a blocked nose?",
];

const PRIVACY_NOTICE =
  "Do not enter personal health information. Mia is a demonstration learning assistant and does not provide medical advice.";
const ATTACHMENT_NOTE = "Demo only — the file will not be uploaded or read.";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

type Pending = { text: string; at: string };

export function ChatView({ initialChat }: { initialChat: ChatDTO | null }) {
  const router = useRouter();
  const [chatId, setChatId] = useState<string | null>(initialChat?.id ?? null);
  const [messages, setMessages] = useState<MessageDTO[]>(initialChat?.messages ?? []);
  const [model, setModel] = useState<ChatModelValue>(initialChat?.settings.model ?? DEFAULT_SETTINGS.model);
  const [temperature, setTemperature] = useState(initialChat?.settings.temperature ?? DEFAULT_SETTINGS.temperature);
  const [topP, setTopP] = useState(initialChat?.settings.topP ?? DEFAULT_SETTINGS.topP);
  const [personaId, setPersonaId] = useState<string | null>(initialChat?.settings.systemPromptId ?? null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const sendingRef = useRef(false);

  const loadPersonas = useCallback(async () => {
    try {
      const data = await apiFetch<{ prompts: Persona[] }>("/api/prompts");
      setPersonas(data.prompts);
      return data.prompts;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    void loadPersonas().then((list) => {
      // New chats default to the seeded Customer persona.
      setPersonaId((current) => current ?? list.find((p) => p.seedKey === "customer-guide")?.id ?? null);
    });
  }, [loadPersonas]);

  // Keep the newest message in view unless the user scrolled up.
  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }
  useEffect(autosize, [input]);

  function describe(e: unknown): string {
    return e instanceof ClientApiError ? e.message : "Something went wrong. Please try again.";
  }

  async function send(raw: string) {
    if (sendingRef.current) return;
    const text = raw.trim();
    if (text === "") {
      setFieldError("Please enter a message before sending.");
      return;
    }
    if (text.length > FIELD_LIMITS.message) {
      setFieldError(`That message is a little too long. Please keep it under ${FIELD_LIMITS.message} characters.`);
      return;
    }
    setFieldError(null);
    setError(null);
    sendingRef.current = true;
    stickToBottom.current = true;
    setPending({ text, at: new Date().toISOString() });
    try {
      const hasAttachment = attachment !== null;
      const result = chatId
        ? await apiFetch<{ sessionId: string; user: MessageDTO; assistant: MessageDTO }>(`/api/chats/${chatId}/messages`, {
            method: "POST",
            body: { message: text, hasAttachment },
          })
        : await apiFetch<{ sessionId: string; user: MessageDTO; assistant: MessageDTO }>("/api/chats", {
            method: "POST",
            body: { message: text, hasAttachment, personaId, settings: { model, temperature, topP } },
          });
      setMessages((current) => [...current, result.user, result.assistant]);
      setInput("");
      setAttachment(null); // cleared when the message is sent
      notifyChatsChanged();
      if (!chatId) {
        setChatId(result.sessionId);
        router.replace(`/chat/${result.sessionId}`);
      }
    } catch (e) {
      // The typed text, settings and valid persona stay in place for a retry.
      if (e instanceof ClientApiError && e.fields?.personaId) {
        const list = await loadPersonas();
        setPersonaId(list.find((p) => p.seedKey === "customer-guide")?.id ?? null);
      }
      setError({ message: describe(e), retry: () => void send(text) });
    } finally {
      setPending(null);
      sendingRef.current = false;
    }
  }

  /** Saves a setting immediately on an existing chat; on /chat/new it stays in browser state only. */
  async function changeSettings(change: { model?: ChatModelValue; temperature?: number; topP?: number; systemPromptId?: string | null }) {
    const previous = { model, temperature, topP, personaId };
    if (change.model !== undefined) setModel(change.model);
    if (change.temperature !== undefined) setTemperature(change.temperature);
    if (change.topP !== undefined) setTopP(change.topP);
    if (change.systemPromptId !== undefined) setPersonaId(change.systemPromptId);
    if (!chatId) return;
    try {
      await apiFetch(`/api/chats/${chatId}`, { method: "PATCH", body: change });
      setError(null);
    } catch (e) {
      setModel(previous.model);
      setTemperature(previous.temperature);
      setTopP(previous.topP);
      setPersonaId(previous.personaId);
      setError({ message: describe(e) });
    }
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext)) || (file.type && !ALLOWED_TYPES.includes(file.type))) {
      setAttachment(null);
      setAttachmentError("Sorry, that file type isn’t supported. Please choose a PDF, PNG or JPG file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setAttachment(null);
      setAttachmentError("That file is too large. Please choose a file smaller than 10 MB.");
      return;
    }
    setAttachmentError(null);
    setAttachment(file);
  }

  async function confirmClear() {
    setBusy(true);
    try {
      if (chatId) {
        await apiFetch(`/api/chats/${chatId}/messages`, { method: "DELETE" });
        setMessages([]);
        notifyChatsChanged();
      }
      setInput("");
      setAttachment(null);
      setFieldError(null);
      setError(null);
      setClearOpen(false);
    } catch (e) {
      setError({ message: describe(e) });
      setClearOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function onClearClick() {
    if (messages.length > 0) setClearOpen(true);
    else {
      setInput("");
      setAttachment(null);
      setFieldError(null);
    }
  }

  const isEmpty = messages.length === 0 && !pending;
  const sending = pending !== null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[11rem] flex-1 flex-col text-xs font-medium text-slate-600 sm:flex-none">
            LLM Model
            <select
              value={model}
              onChange={(e) => void changeSettings({ model: e.target.value as ChatModelValue })}
              className="mt-1 min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
            >
              {CHAT_MODELS.map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col text-xs font-medium text-slate-600 sm:flex-none">
            Persona
            <select
              value={personaId ?? ""}
              onChange={(e) => void changeSettings({ systemPromptId: e.target.value || null })}
              className="mt-1 min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
            >
              {personaId === null && <option value="">Customer (default)</option>}
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
            <SlidersHorizontal className="size-4" aria-hidden /> Advanced settings
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{SIMULATION_NOTE}</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {isEmpty && (
            <section className="rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm">
              <h1 className="text-lg font-semibold text-slate-900">Hi, I’m Mia!</h1>
              <p className="mt-1 text-sm text-slate-600">
                I can help you learn about over-the-counter medicines and other pharmacy products. Try one of these questions:
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="min-h-11 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-left text-sm text-teal-900 hover:bg-teal-100"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>
          )}

          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} content={m.content} at={m.createdAt} cards={m.cards} />
          ))}
          {pending && <Bubble role="user" content={pending.text} at={pending.at} cards={[]} />}
          {sending && (
            <div className="flex" role="status" aria-live="polite">
              <div className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">Mia is typing...</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl space-y-2">
          {error && <ApiNotice message={error.message} onRetry={error.retry} />}
          {(attachment || attachmentError) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {attachment && (
                <>
                  <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 pl-3 text-slate-800">
                    <span className="truncate">{attachment.name}</span>
                    <button type="button" aria-label="Remove attachment" className={iconButtonClass} onClick={() => setAttachment(null)}>
                      <X className="size-4" aria-hidden />
                    </button>
                  </span>
                  <span className="text-xs text-slate-500">{ATTACHMENT_NOTE}</span>
                </>
              )}
              {attachmentError && <span role="alert" className="text-xs text-red-700">{attachmentError}</span>}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={onFileChosen}
            />
            <button type="button" aria-label="Attach File" className={iconButtonClass} onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-5" aria-hidden />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              aria-label="Message"
              aria-invalid={fieldError ? true : undefined}
              placeholder="Ask Mia about a product or symptom..."
              onChange={(e) => {
                setInput(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              className={cn(
                "max-h-[200px] min-h-11 flex-1 resize-none rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 md:text-sm",
                fieldError ? "border-red-400" : "border-slate-300",
              )}
            />
            <Button variant="secondary" onClick={onClearClick} disabled={sending} className="hidden sm:inline-flex">
              Clear Chat
            </Button>
            <Button onClick={() => void send(input)} disabled={sending} aria-label="Send">
              <Send className="size-4" aria-hidden /> <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-slate-500">{PRIVACY_NOTICE}</p>
            <button type="button" onClick={onClearClick} disabled={sending} className="min-h-11 shrink-0 px-2 text-xs font-medium text-slate-600 underline sm:hidden">
              Clear Chat
            </button>
          </div>
          {fieldError && (
            <p role="alert" className="text-sm text-red-700">
              {fieldError}
            </p>
          )}
          {input.length > FIELD_LIMITS.message - 200 && (
            <p className="text-xs text-slate-500" aria-live="polite">
              {input.length} / {FIELD_LIMITS.message} characters
            </p>
          )}
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        temperature={temperature}
        topP={topP}
        onChange={(change) => void changeSettings(change)}
      />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this chat?"
        description="This deletes all messages in this chat. The chat’s model, persona and settings are kept."
        confirmLabel="Clear Chat"
        onConfirm={confirmClear}
        busy={busy}
      />
    </div>
  );
}

function Bubble({ role, content, at, cards }: { role: "user" | "assistant"; content: string; at: string; cards: MessageDTO["cards"] }) {
  const mine = role === "user";
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[90%] whitespace-pre-wrap break-words rounded-lg px-4 py-2 text-sm leading-relaxed sm:max-w-[80%]",
          mine ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-900",
        )}
      >
        {content}
      </div>
      {cards.length > 0 && (
        <div className="grid w-full max-w-[90%] gap-2 sm:max-w-[80%]">
          {cards.map((card, i) => (
            <ProductCard key={i} card={card} />
          ))}
        </div>
      )}
      <time dateTime={at} className="px-1 text-xs text-slate-500">
        {formatTime(at)}
      </time>
    </div>
  );
}
