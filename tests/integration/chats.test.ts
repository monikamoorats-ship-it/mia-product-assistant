/**
 * Chat persistence integration tests. CI only (disposable PostgreSQL).
 * The artificial 1.5 s delay is skipped with delayMs: 0.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import {
  MAX_CHATS,
  clearChat,
  clearHistory,
  deleteChat,
  getChat,
  listChats,
  resolvePersona,
  sendChatMessage,
  updateChatSettings,
} from "@/server/chats";
import { OWNER_A, OWNER_B, customProduct, prisma, resetAndSeed } from "./helpers";

const send = (ownerId: string, sessionId: string | null, message: string, extra: Record<string, unknown> = {}) =>
  sendChatMessage(prisma, { ownerId, sessionId, message, delayMs: 0, ...extra });

const rejects = async (promise: Promise<unknown>, status?: number) => {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  if (status) expect((error as AppError).status).toBe(status);
  return error as AppError;
};

beforeEach(resetAndSeed);
afterAll(() => prisma.$disconnect());

describe("first message from /chat/new", () => {
  it("creates exactly one session with the user message and Mia's answer", async () => {
    const result = await send(OWNER_A, null, "What helps with hay fever?");
    expect(await prisma.chatSession.count({ where: { ownerId: OWNER_A } })).toBe(1);
    const chat = await getChat(prisma, OWNER_A, result.sessionId);
    expect(chat?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(chat?.title).toBe("What helps with hay fever?");
    expect(chat?.messages[1].content).toContain("Ask a pharmacist if you’re unsure.");
    expect(chat?.messages[1].cards[0]).toMatchObject({ unavailable: false, linkAvailable: true });
  });

  it("saves the chosen settings and persona with the first message", async () => {
    const coach = await prisma.systemPrompt.findUniqueOrThrow({ where: { seedKey: "learning-coach" } });
    const result = await send(OWNER_A, null, "ibuprofen", {
      settings: { model: "LLAMA_STYLE", temperature: 0.9, topP: 0.2 },
      personaId: coach.id,
    });
    const chat = await getChat(prisma, OWNER_A, result.sessionId);
    expect(chat?.settings).toEqual({ model: "LLAMA_STYLE", temperature: 0.9, topP: 0.2, systemPromptId: coach.id });
    expect(chat?.messages[1].content).toContain("Counselling tip:");
  });

  it("defaults to GPT-4 style, 0.5, 0.5 and the Customer persona", async () => {
    const result = await send(OWNER_A, null, "ibuprofen");
    const chat = await getChat(prisma, OWNER_A, result.sessionId);
    const customer = await prisma.systemPrompt.findUniqueOrThrow({ where: { seedKey: "customer-guide" } });
    expect(chat?.settings).toEqual({ model: "GPT4_STYLE", temperature: 0.5, topP: 0.5, systemPromptId: customer.id });
  });

  it("rejects empty, whitespace-only and over-length messages without creating anything", async () => {
    await rejects(send(OWNER_A, null, ""), 422);
    await rejects(send(OWNER_A, null, "   \n "), 422);
    await rejects(send(OWNER_A, null, "x".repeat(2001)), 422);
    expect(await prisma.chatSession.count()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
  });

  it("rejects invalid settings and another owner's persona without creating anything", async () => {
    await rejects(send(OWNER_A, null, "ibuprofen", { settings: { model: "GPT-5", temperature: 0.5, topP: 0.5 } }), 422);
    await rejects(send(OWNER_A, null, "ibuprofen", { settings: { model: "GPT4_STYLE", temperature: 2, topP: 0.5 } }), 422);
    const theirs = await prisma.systemPrompt.create({ data: { ownerId: OWNER_B, name: "Theirs", content: "c" } });
    await rejects(send(OWNER_A, null, "ibuprofen", { personaId: theirs.id }), 409);
    expect(await prisma.chatSession.count()).toBe(0);
  });

  it("concurrent first messages leave no empty sessions behind", async () => {
    await Promise.all([send(OWNER_A, null, "ibuprofen"), send(OWNER_A, null, "paracetamol")]);
    expect(await prisma.chatSession.count({ where: { ownerId: OWNER_A, messageCount: 0 } })).toBe(0);
  });
});

describe("empty sessions", () => {
  it("are hidden from the list and reused by the next first message", async () => {
    const empty = await prisma.chatSession.create({ data: { ownerId: OWNER_A } });
    expect(await listChats(prisma, OWNER_A)).toEqual([]);
    const result = await send(OWNER_A, null, "ibuprofen");
    expect(result.sessionId).toBe(empty.id);
    expect(await prisma.chatSession.count({ where: { ownerId: OWNER_A } })).toBe(1);
  });

  it("legacy duplicate empty sessions are cleaned up (only one may exist)", async () => {
    await prisma.chatSession.create({ data: { ownerId: OWNER_A, messageCount: 1 } }); // non-empty, unrelated
    await prisma.chatSession.create({ data: { ownerId: OWNER_A } });
    await expect(prisma.chatSession.create({ data: { ownerId: OWNER_A } })).rejects.toThrow(); // DB-level guarantee
  });

  it("do not count toward the 50-chat limit, but a full list blocks a new non-empty chat", async () => {
    await prisma.chatSession.createMany({ data: Array.from({ length: MAX_CHATS }, () => ({ ownerId: OWNER_A, messageCount: 2 })) });
    const empty = await prisma.chatSession.create({ data: { ownerId: OWNER_A } });
    await rejects(send(OWNER_A, null, "ibuprofen"), 409);
    await rejects(send(OWNER_A, empty.id, "ibuprofen"), 409);
    // The empty session is unchanged and nothing was saved.
    expect((await prisma.chatSession.findUniqueOrThrow({ where: { id: empty.id } })).messageCount).toBe(0);
    expect(await prisma.message.count()).toBe(0);
    // Other owners are unaffected by this owner's limit.
    await send(OWNER_B, null, "ibuprofen");
  });
});

describe("existing chats", () => {
  it("appends messages, keeps the title and uses the saved settings", async () => {
    const first = await send(OWNER_A, null, "ibuprofen", { settings: { model: "CLAUDE_STYLE", temperature: 0.5, topP: 0.5 } });
    const second = await send(OWNER_A, first.sessionId, "paracetamol");
    expect(second.title).toBe("ibuprofen");
    const chat = await getChat(prisma, OWNER_A, first.sessionId);
    expect(chat?.messages).toHaveLength(4);
    expect(chat?.messages[3].content).toContain("Context:"); // Claude style
  });

  it("settings changes apply only to later answers and never rewrite old messages", async () => {
    const first = await send(OWNER_A, null, "ibuprofen", { settings: { model: "GPT4_STYLE", temperature: 0.5, topP: 0.5 } });
    const before = (await getChat(prisma, OWNER_A, first.sessionId))!.messages[1].content;
    await updateChatSettings(prisma, OWNER_A, first.sessionId, { model: "LLAMA_STYLE", topP: 0.2 });
    const after = await getChat(prisma, OWNER_A, first.sessionId);
    expect(after?.messages[1].content).toBe(before);
    expect(after?.settings).toMatchObject({ model: "LLAMA_STYLE", topP: 0.2 });
    const next = await send(OWNER_A, first.sessionId, "ibuprofen");
    expect(next.assistant.content).not.toContain("•");
  });

  it("validates settings updates", async () => {
    const { sessionId } = await send(OWNER_A, null, "ibuprofen");
    await rejects(updateChatSettings(prisma, OWNER_A, sessionId, { temperature: 1.5 }), 422);
    await rejects(updateChatSettings(prisma, OWNER_A, sessionId, { model: "nope" }), 422);
    await rejects(updateChatSettings(prisma, OWNER_A, sessionId, { systemPromptId: "missing" }), 409);
  });

  it("enforces the 200-message limit with no partial write", async () => {
    const { sessionId } = await send(OWNER_A, null, "ibuprofen");
    await prisma.chatSession.update({ where: { id: sessionId }, data: { messageCount: 200 } });
    await rejects(send(OWNER_A, sessionId, "ibuprofen"), 409);
    expect(await prisma.message.count({ where: { sessionId } })).toBe(2);
  });
});

describe("Clear Chat versus Delete Chat", () => {
  it("Clear Chat removes messages, keeps session and settings, resets the title and hides it", async () => {
    const { sessionId } = await send(OWNER_A, null, "ibuprofen", { settings: { model: "CLAUDE_STYLE", temperature: 0.9, topP: 0.9 } });
    expect(await clearChat(prisma, OWNER_A, sessionId)).toBe(true);
    const session = await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session).toMatchObject({ title: "New chat", messageCount: 0, model: "CLAUDE_STYLE", temperature: 0.9, topP: 0.9 });
    expect(await prisma.message.count({ where: { sessionId } })).toBe(0);
    expect(await listChats(prisma, OWNER_A)).toEqual([]);
    // The next message reuses the same session and generates a fresh title.
    const next = await send(OWNER_A, sessionId, "paracetamol");
    expect(next.sessionId).toBe(sessionId);
    expect(next.title).toBe("paracetamol");
  });

  it("repeated Clear Chat leaves only one empty session", async () => {
    const a = await send(OWNER_A, null, "ibuprofen");
    const b = await send(OWNER_A, null, "paracetamol");
    await clearChat(prisma, OWNER_A, a.sessionId);
    await clearChat(prisma, OWNER_A, b.sessionId);
    await clearChat(prisma, OWNER_A, b.sessionId);
    expect(await prisma.chatSession.count({ where: { ownerId: OWNER_A, messageCount: 0 } })).toBe(1);
  });

  it("Delete Chat removes the session and cascades its messages", async () => {
    const { sessionId } = await send(OWNER_A, null, "ibuprofen");
    expect(await deleteChat(prisma, OWNER_A, sessionId)).toBe(true);
    expect(await prisma.chatSession.count()).toBe(0);
    expect(await prisma.message.count()).toBe(0);
  });
});

describe("owner isolation", () => {
  it("another owner cannot read, change, clear, delete or post to a chat by ID", async () => {
    const { sessionId } = await send(OWNER_A, null, "ibuprofen");
    expect(await getChat(prisma, OWNER_B, sessionId)).toBeNull();
    expect(await deleteChat(prisma, OWNER_B, sessionId)).toBe(false);
    expect(await clearChat(prisma, OWNER_B, sessionId)).toBe(false);
    await rejects(updateChatSettings(prisma, OWNER_B, sessionId, { topP: 0.1 }), 404);
    await rejects(send(OWNER_B, sessionId, "hello"), 404);
    expect(await listChats(prisma, OWNER_B)).toEqual([]);
    expect(await getChat(prisma, OWNER_A, sessionId)).not.toBeNull();
    expect(await prisma.message.count({ where: { sessionId } })).toBe(2);
  });
});

describe("personas", () => {
  it("deleting a custom persona sets the chat's persona to null and keeps messages", async () => {
    const mine = await prisma.systemPrompt.create({ data: { ownerId: OWNER_A, name: "Mine", content: "c" } });
    const { sessionId } = await send(OWNER_A, null, "ibuprofen", { personaId: mine.id });
    await prisma.systemPrompt.delete({ where: { id: mine.id } });
    const chat = await getChat(prisma, OWNER_A, sessionId);
    expect(chat?.settings.systemPromptId).toBeNull();
    expect(chat?.messages).toHaveLength(2);
    const next = await send(OWNER_A, sessionId, "ibuprofen"); // Customer fallback tone
    expect(next.assistant.content).not.toContain("Counselling tip:");
  });

  it("a deleted persona before the first message is rejected, nothing is saved", async () => {
    const mine = await prisma.systemPrompt.create({ data: { ownerId: OWNER_A, name: "Mine", content: "c" } });
    await prisma.systemPrompt.delete({ where: { id: mine.id } });
    await rejects(send(OWNER_A, null, "ibuprofen", { personaId: mine.id }), 409);
    expect(await prisma.chatSession.count()).toBe(0);
  });

  it("resolves seeded personas for everyone and custom ones only for their owner", async () => {
    const mine = await prisma.systemPrompt.create({ data: { ownerId: OWNER_A, name: "Mine", content: "c" } });
    expect((await resolvePersona(prisma, OWNER_B, undefined)).seedKey).toBe("customer-guide");
    expect((await resolvePersona(prisma, OWNER_A, mine.id)).id).toBe(mine.id);
    await rejects(resolvePersona(prisma, OWNER_B, mine.id), 409);
  });
});

describe("product snapshots", () => {
  it("old answers keep their product card after the product is edited", async () => {
    const product = await customProduct(OWNER_A, { name: "Zinc balm", useFor: "Dry skin", tip: "Original tip" });
    const { sessionId } = await send(OWNER_A, null, "Zinc balm");
    await prisma.product.update({ where: { id: product.id }, data: { name: "Renamed", tip: "Changed tip" } });
    const card = (await getChat(prisma, OWNER_A, sessionId))!.messages[1].cards[0];
    expect(card).toMatchObject({ unavailable: false, linkAvailable: true, product: { name: "Zinc balm", tip: "Original tip" } });
  });

  it("a deleted product stays visible as a snapshot without a link", async () => {
    const product = await customProduct(OWNER_A, { name: "Zinc balm" });
    const { sessionId } = await send(OWNER_A, null, "Zinc balm");
    await prisma.product.delete({ where: { id: product.id } });
    const card = (await getChat(prisma, OWNER_A, sessionId))!.messages[1].cards[0];
    expect(card).toMatchObject({ unavailable: false, linkAvailable: false, product: { name: "Zinc balm" } });
  });

  it("never matches or snapshots another owner's custom product", async () => {
    await customProduct(OWNER_B, { name: "Secret balm", activeSubstance: "secretium", useFor: "Secret use" });
    const { sessionId } = await send(OWNER_A, null, "Secret balm secretium");
    const chat = await getChat(prisma, OWNER_A, sessionId);
    expect(chat?.messages[1].cards).toEqual([]);
    expect(chat?.messages[1].content).toContain("couldn’t find a matching product");
  });

  it("stores at most three snapshots and legacy productIds resolve only visible products", async () => {
    const { sessionId } = await send(OWNER_A, null, "fever");
    const assistant = (await prisma.message.findMany({ where: { sessionId, role: "assistant" } }))[0];
    expect((assistant.productSnapshots as unknown[]).length).toBeLessThanOrEqual(3);

    const mine = await customProduct(OWNER_A);
    const theirs = await customProduct(OWNER_B, { name: "Theirs" });
    await prisma.message.update({
      where: { id: assistant.id },
      data: { productIds: [mine.id, theirs.id, "gone"] },
    });
    // Prisma needs an explicit JSON null to clear the column.
    await prisma.$executeRaw`UPDATE "Message" SET "productSnapshots" = NULL WHERE id = ${assistant.id}`;
    const cards = (await getChat(prisma, OWNER_A, sessionId))!.messages[1].cards;
    expect(cards[0]).toMatchObject({ unavailable: false, product: { name: "Custom balm" } });
    expect(cards[1]).toEqual({ unavailable: true });
    expect(cards[2]).toEqual({ unavailable: true });
  });

  it("malformed stored snapshots are ignored safely", async () => {
    const { sessionId } = await send(OWNER_A, null, "ibuprofen");
    await prisma.$executeRaw`UPDATE "Message" SET "productSnapshots" = '[{"name":1}]'::jsonb WHERE "sessionId" = ${sessionId} AND role = 'assistant'`;
    const chat = await getChat(prisma, OWNER_A, sessionId);
    expect(chat?.messages[1].cards.every((c) => c.unavailable)).toBe(true);
  });
});

describe("Clear my history", () => {
  it("deletes chats and quiz results but keeps custom products, personas and other owners' data", async () => {
    await send(OWNER_A, null, "ibuprofen");
    await send(OWNER_A, null, "paracetamol");
    await prisma.chatSession.create({ data: { ownerId: OWNER_A } });
    await prisma.quizResult.create({ data: { ownerId: OWNER_A, score: 4, total: 5 } });
    await customProduct(OWNER_A);
    await prisma.systemPrompt.create({ data: { ownerId: OWNER_A, name: "Mine", content: "c" } });
    await send(OWNER_B, null, "ibuprofen");
    await prisma.quizResult.create({ data: { ownerId: OWNER_B, score: 2, total: 5 } });

    await clearHistory(prisma, OWNER_A);

    expect(await prisma.chatSession.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.quizResult.count({ where: { ownerId: OWNER_A } })).toBe(0);
    expect(await prisma.product.count({ where: { ownerId: OWNER_A } })).toBe(1);
    expect(await prisma.systemPrompt.count({ where: { ownerId: OWNER_A } })).toBe(1);
    expect(await prisma.chatSession.count({ where: { ownerId: OWNER_B } })).toBe(1);
    expect(await prisma.quizResult.count({ where: { ownerId: OWNER_B } })).toBe(1);
    expect(await prisma.product.count({ where: { ownerId: null } })).toBe(7);
  });
});

describe("safety through the stored answer", () => {
  it("an emergency message is saved with the fixed reply and no cards", async () => {
    const { sessionId } = await send(OWNER_A, null, "My throat is swelling after taking ibuprofen.");
    const chat = await getChat(prisma, OWNER_A, sessionId);
    expect(chat?.messages[1].content).toBe("This may be urgent. Contact your local emergency number or a doctor right away.");
    expect(chat?.messages[1].cards).toEqual([]);
  });
});
