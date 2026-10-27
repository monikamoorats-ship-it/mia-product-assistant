/** Expected, user-facing failures. Messages are safe to show in the UI. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const CHAT_LIMIT_MESSAGE =
  "You have reached the limit of 50 chats. Please delete a chat to start a new one.";
export const MESSAGE_LIMIT_MESSAGE =
  "This chat has reached its limit of 200 messages. Please start a new chat.";
export const PERSONA_UNAVAILABLE_MESSAGE =
  "That persona is no longer available. I switched to Customer — please send your message again.";
export const CHAT_CHANGED_MESSAGE =
  "This chat was just changed in another tab. Please reload the page and try again.";
