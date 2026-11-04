"use client";

import { BookOpen, MessageCircle, Plus, Trash2, Pill, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiNotice } from "./api-notice";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
import { ClientApiError, apiFetch, formatTime, notifyChatsChanged } from "@/lib/client-api";
import { cn } from "@/lib/cn";

type ChatItem = { id: string; title: string; updatedAt: string };

const NAV = [
  { href: "/", label: "Chat", icon: MessageCircle, match: (p: string) => p === "/" || p.startsWith("/chat") },
  { href: "/products", label: "Products", icon: Pill, match: (p: string) => p.startsWith("/products") },
  { href: "/quiz", label: "Quiz", icon: ListChecks, match: (p: string) => p.startsWith("/quiz") },
] as const;

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [chats, setChats] = useState<ChatItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ chats: ChatItem[] }>("/api/chats");
      setChats(data.chats);
      setError(null);
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("mia:chats-changed", handler);
    return () => window.removeEventListener("mia:chats-changed", handler);
  }, [load, pathname]);

  async function confirmDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/chats/${deleteId}`, { method: "DELETE" });
      const wasOpen = pathname === `/chat/${deleteId}`;
      setDeleteId(null);
      await load();
      if (wasOpen) router.push("/chat/new");
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Something went wrong.");
      setDeleteId(null);
    } finally {
      setBusy(false);
    }
  }

  async function confirmClearHistory() {
    setBusy(true);
    try {
      await apiFetch("/api/history", { method: "DELETE" });
      setClearOpen(false);
      setChats([]);
      notifyChatsChanged();
      onNavigate?.();
      router.push("/chat/new");
      router.refresh();
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Something went wrong.");
      setClearOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-teal-600 text-white" aria-hidden>
          <BookOpen className="size-5" />
        </span>
        <span className="text-xl font-semibold text-slate-900">Mia</span>
      </div>

      <nav aria-label="Main" className="space-y-1 px-2">
        {NAV.map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            onClick={onNavigate}
            aria-current={match(pathname) ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium",
              match(pathname) ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <h2 className="mt-4 px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Chat History</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {error && <ApiNotice message={error} onRetry={load} />}
        {chats === null && !error && <p className="px-2 py-2 text-sm text-slate-500">Loading chats…</p>}
        {chats?.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">No chats yet. Start a new one below.</p>}
        <ul className="space-y-0.5">
          {chats?.map((chat) => (
            <li key={chat.id} className="group relative">
              <Link
                href={`/chat/${chat.id}`}
                prefetch={false}
                onClick={onNavigate}
                aria-current={pathname === `/chat/${chat.id}` ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col justify-center rounded-lg py-1 pl-3 pr-12 text-sm",
                  pathname === `/chat/${chat.id}` ? "bg-slate-100" : "hover:bg-slate-50",
                )}
              >
                <span className="truncate font-medium text-slate-800">{chat.title}</span>
                <span className="text-xs text-slate-500">{formatTime(chat.updatedAt)}</span>
              </Link>
              <button
                type="button"
                aria-label={`Delete chat: ${chat.title}`}
                onClick={() => setDeleteId(chat.id)}
                className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link
          href="/chat/new"
          prefetch={false}
          onClick={onNavigate}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="size-4" aria-hidden /> New Chat
        </Link>
        <Button variant="ghost" className="w-full text-slate-600" onClick={() => setClearOpen(true)}>
          Clear my history
        </Button>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this chat?"
        description="This permanently deletes the chat and its messages. This action cannot be undone."
        confirmLabel="Delete chat"
        onConfirm={confirmDelete}
        busy={busy}
      />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear my history?"
        description="This will permanently delete all your chats, chat messages and quiz results from this browser profile. Your custom products and personas will not be deleted. This action cannot be undone."
        confirmLabel="Clear my history"
        onConfirm={confirmClearHistory}
        busy={busy}
      />
    </div>
  );
}
