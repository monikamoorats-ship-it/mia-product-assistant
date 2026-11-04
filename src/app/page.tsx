import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DbUnavailable } from "@/components/db-unavailable";
import { getPrisma } from "@/lib/db";
import { logDbError } from "@/lib/log-error";
import { OWNER_COOKIE, ownerIdFromCookie } from "@/lib/owner";
import { latestChatId } from "@/server/chats";

// Read-only: opens the most recent non-empty chat, otherwise the unsaved /chat/new.
export default async function Home() {
  const ownerId = ownerIdFromCookie((await cookies()).get(OWNER_COOKIE)?.value);
  let target = "/chat/new";
  if (ownerId) {
    try {
      const id = await latestChatId(getPrisma(), ownerId);
      if (id) target = `/chat/${id}`;
    } catch (error) {
      logDbError("page-home", error);
      return <DbUnavailable />;
    }
  }
  redirect(target);
}
