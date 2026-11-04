"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Dialog } from "./ui/dialog";
import { iconButtonClass } from "./ui/button";

export const DISCLAIMER = "Mia is a learning tool and does not replace advice from a pharmacist or doctor.";
export const FOOTER_TEXT = "© 2026 Mia Product Learning Assistant. Built with Claude Code";

/**
 * Shared layout: fixed 260 px sidebar on desktop (md and up), hamburger drawer
 * on mobile, and an always-visible disclaimer bar and footer.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer after any navigation.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      <div
        role="note"
        className="shrink-0 bg-teal-700 px-3 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-center text-xs text-white"
      >
        {DISCLAIMER}
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col" aria-label="Sidebar">
          <Sidebar />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 md:hidden">
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              className={iconButtonClass}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <span className="text-lg font-semibold text-teal-700">Mia</span>
          </header>
          <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] text-center text-xs text-slate-600">
        {FOOTER_TEXT}
      </footer>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen} title="Mia navigation" side="left">
        <div className="-m-4 flex h-[calc(100%+2rem)] flex-col">
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </div>
      </Dialog>
    </div>
  );
}
