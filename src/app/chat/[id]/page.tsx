import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { DbUnavailable } from "@/components/db-unavailable";
import { getPrisma } from "@/lib/db";
import { OWNER_COOKIE, ownerIdFromCookie } from "@/lib/owner";
import { getChat, type ChatDTO } from "@/server/chats";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ownerId = ownerIdFromCookie((await cookies()).get(OWNER_COOKIE)?.value);
  // Missing and foreign chats are indistinguishable: both render "Chat not found".
  if (!ownerId) notFound();

  let chat: ChatDTO | null;
  try {
    chat = await getChat(getPrisma(), ownerId, id);
  } catch {
    return <DbUnavailable />;
  }
  if (!chat) notFound();
  return <ChatView key={chat.id} initialChat={chat} />;
}
