import { ChatView } from "@/components/chat/chat-view";

// An unsaved, empty composer. Opening or prefetching this page writes nothing:
// the session is created by the first valid message.
export default function NewChatPage() {
  return <ChatView key="new" initialChat={null} />;
}
