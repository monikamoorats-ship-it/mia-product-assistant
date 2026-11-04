/**
 * Owner-scoped chat persistence. Every query and mutation takes the current
 * anonymous ownerId and filters on it, so a guessed record ID can never reach
 * another owner's data. Message content is never logged here.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { buildAnswer, type AnswerProduct } from "@/lib/response/pipeline";
import { createSnapshots, parseSnapshots, type ProductSnapshot } from "@/lib/response/snapshots";
import {
  DEFAULT_SETTINGS,
  makeChatTitle,
  validateMessage,
  validateSettings,
  type ChatSettings,
} from "@/lib/validation";
import {
  AppError,
  CHAT_CHANGED_MESSAGE,
  CHAT_LIMIT_MESSAGE,
  MESSAGE_LIMIT_MESSAGE,
  PERSONA_UNAVAILABLE_MESSAGE,
} from "./errors";

export const MAX_CHATS = 50;
export const MAX_MESSAGES = 200;
export const ASSISTANT_DELAY_MS = 1500;

type Db = PrismaClient | Prisma.TransactionClient;

const visibleTo = (ownerId: string) => ({ OR: [{ ownerId: null }, { ownerId }] });

export type CardDTO =
  | { unavailable: true }
  | { unavailable: false; product: ProductSnapshot; linkAvailable: boolean };

export type MessageDTO = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  cards: CardDTO[];
};

export type ChatSettingsDTO = ChatSettings & { systemPromptId: string | null };

export type ChatDTO = {
  id: string;
  title: string;
  updatedAt: string;
  settings: ChatSettingsDTO;
  messages: MessageDTO[];
};

export type ChatListItem = { id: string; title: string; updatedAt: string };

/** Products visible to the owner: global seeded + the owner's custom ones. */
export async function listVisibleProducts(db: Db, ownerId: string | null): Promise<AnswerProduct[]> {
  return db.product.findMany({
    where: ownerId ? visibleTo(ownerId) : { ownerId: null },
    orderBy: { name: "asc" },
  });
}

export async function listChats(db: Db, ownerId: string): Promise<ChatListItem[]> {
  const rows = await db.chatSession.findMany({
    where: { ownerId, messageCount: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take: MAX_CHATS,
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

/** ID of the most recently updated non-empty chat, or null. Read-only. */
export async function latestChatId(db: Db, ownerId: string): Promise<string | null> {
  const row = await db.chatSession.findFirst({
    where: { ownerId, messageCount: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Loads one chat scoped to its owner, rendering cards from stored snapshots. */
export async function getChat(db: Db, ownerId: string, id: string): Promise<ChatDTO | null> {
  const session = await db.chatSession.findFirst({
    where: { id, ownerId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) return null;

  // Which referenced products still exist and are visible to this owner?
  const referencedIds = new Set<string>();
  for (const m of session.messages) {
    for (const s of parseSnapshots(m.productSnapshots)) referencedIds.add(s.productId);
    for (const pid of m.productIds) referencedIds.add(pid);
  }
  const current = referencedIds.size
    ? await db.product.findMany({ where: { id: { in: [...referencedIds] }, ...visibleTo(ownerId) } })
    : [];
  const currentById = new Map(current.map((p) => [p.id, p]));

  const messages: MessageDTO[] = session.messages.map((m) => {
    const snapshots = parseSnapshots(m.productSnapshots);
    let cards: CardDTO[];
    if (snapshots.length > 0) {
      cards = snapshots.map((product) => ({
        unavailable: false,
        product,
        linkAvailable: currentById.has(product.productId),
      }));
    } else {
      // Legacy message with only productIds: resolve only currently visible products.
      cards = m.productIds.map((pid): CardDTO => {
        const p = currentById.get(pid);
        return p
          ? {
              unavailable: false,
              linkAvailable: true,
              product: {
                productId: p.id,
                name: p.name,
                activeSubstance: p.activeSubstance,
                category: p.category,
                useFor: p.useFor,
                howToUse: p.howToUse,
                tip: p.tip,
                source: p.ownerId === null ? "seeded" : "custom",
              },
            }
          : { unavailable: true };
      });
    }
    return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString(), cards };
  });

  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt.toISOString(),
    settings: {
      model: session.model,
      temperature: session.temperature,
      topP: session.topP,
      systemPromptId: session.systemPromptId,
    },
    messages,
  };
}

/** Persona the owner may use: a global seeded persona or one of their own. */
export async function resolvePersona(
  db: Db,
  ownerId: string,
  personaId: string | null | undefined,
): Promise<{ id: string | null; seedKey: string | null }> {
  if (personaId === undefined || personaId === null || personaId === "") {
    const fallback = await db.systemPrompt.findUnique({ where: { seedKey: "customer-guide" } });
    return { id: fallback?.id ?? null, seedKey: fallback?.seedKey ?? null };
  }
  const persona = await db.systemPrompt.findFirst({ where: { id: personaId, ...visibleTo(ownerId) } });
  if (!persona) throw new AppError(409, PERSONA_UNAVAILABLE_MESSAGE, { personaId: PERSONA_UNAVAILABLE_MESSAGE });
  return { id: persona.id, seedKey: persona.seedKey };
}

export async function updateChatSettings(
  db: Db,
  ownerId: string,
  id: string,
  body: { model?: unknown; temperature?: unknown; topP?: unknown; systemPromptId?: unknown },
): Promise<ChatSettingsDTO> {
  const checked = validateSettings(body, true);
  if (!checked.ok) throw new AppError(422, Object.values(checked.errors)[0], checked.errors);
  const data: Prisma.ChatSessionUpdateManyMutationInput & { systemPromptId?: string | null } = { ...checked.value };
  if (body.systemPromptId !== undefined) {
    if (body.systemPromptId !== null && typeof body.systemPromptId !== "string") {
      throw new AppError(422, "Please choose a valid persona.");
    }
    const persona = await resolvePersona(db, ownerId, body.systemPromptId as string | null);
    data.systemPromptId = persona.id;
  }
  const { systemPromptId, ...rest } = data;
  const result = await db.chatSession.updateMany({
    where: { id, ownerId },
    data: { ...rest, ...(systemPromptId !== undefined ? { systemPromptId } : {}), updatedAt: new Date() },
  });
  if (result.count === 0) throw new AppError(404, "We couldn’t find that chat.");
  const session = await db.chatSession.findFirstOrThrow({ where: { id, ownerId } });
  return {
    model: session.model,
    temperature: session.temperature,
    topP: session.topP,
    systemPromptId: session.systemPromptId,
  };
}

export async function deleteChat(db: Db, ownerId: string, id: string): Promise<boolean> {
  const result = await db.chatSession.deleteMany({ where: { id, ownerId } });
  return result.count > 0;
}

/**
 * Clear Chat: deletes the messages (and their embedded snapshots) but keeps
 * the session and its settings. The session becomes the owner's single empty
 * session; any other empty sessions are removed in the same transaction.
 */
export async function clearChat(prisma: PrismaClient, ownerId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const session = await tx.chatSession.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!session) return false;
    await tx.message.deleteMany({ where: { sessionId: id } });
    await tx.chatSession.deleteMany({ where: { ownerId, messageCount: 0, NOT: { id } } });
    await tx.chatSession.update({ where: { id }, data: { title: "New chat", messageCount: 0 } });
    return true;
  });
}

/** Clear my history: all chats (cascading to messages) and quiz results. Custom items are kept. */
export async function clearHistory(prisma: PrismaClient, ownerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.chatSession.deleteMany({ where: { ownerId } });
    await tx.quizResult.deleteMany({ where: { ownerId } });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SendInput = {
  ownerId: string;
  /** null = first message from /chat/new. */
  sessionId: string | null;
  message: unknown;
  settings?: unknown;
  personaId?: unknown;
  hasAttachment?: boolean;
  delayMs?: number;
};

export type SendResult = { sessionId: string; title: string; user: MessageDTO; assistant: MessageDTO };

/**
 * Validates, builds the deterministic answer, simulates the 1.5 s delay and
 * then saves the user message and the assistant answer in ONE transaction, so
 * a rejected or failed request never leaves a partial record.
 *
 * Settings are captured as a server-side snapshot before generation starts;
 * changes made in another tab meanwhile do not affect this answer.
 */
export async function sendChatMessage(prisma: PrismaClient, input: SendInput): Promise<SendResult> {
  const { ownerId } = input;
  const checkedMessage = validateMessage(input.message);
  if (!checkedMessage.ok) throw new AppError(422, checkedMessage.errors.message, checkedMessage.errors);
  const message = checkedMessage.value;

  // --- settings snapshot -------------------------------------------------
  let settings: ChatSettings;
  let personaId: string | null;
  let personaSeedKey: string | null;
  let wasEmpty = false;

  if (input.sessionId) {
    const session = await prisma.chatSession.findFirst({
      where: { id: input.sessionId, ownerId },
      include: { systemPrompt: { select: { seedKey: true } } },
    });
    if (!session) throw new AppError(404, "We couldn’t find that chat.");
    if (session.messageCount + 2 > MAX_MESSAGES) throw new AppError(409, MESSAGE_LIMIT_MESSAGE);
    settings = { model: session.model, temperature: session.temperature, topP: session.topP };
    personaId = session.systemPromptId;
    personaSeedKey = session.systemPrompt?.seedKey ?? null; // null => Customer tone
    wasEmpty = session.messageCount === 0;
  } else {
    const raw = (typeof input.settings === "object" && input.settings !== null ? input.settings : {}) as Record<string, unknown>;
    const checked = validateSettings({ ...DEFAULT_SETTINGS, ...raw });
    if (!checked.ok) throw new AppError(422, Object.values(checked.errors)[0], checked.errors);
    settings = checked.value as ChatSettings;
    const persona = await resolvePersona(prisma, ownerId, (input.personaId as string | null | undefined) ?? undefined);
    personaId = persona.id;
    personaSeedKey = persona.seedKey;
    wasEmpty = true;
  }

  // --- generate (pure) ---------------------------------------------------
  const products = await listVisibleProducts(prisma, ownerId);
  const answer = buildAnswer({
    message,
    products,
    personaSeedKey,
    settings,
    hasAttachment: input.hasAttachment === true,
  });
  const snapshots = createSnapshots(answer.products, ownerId, answer.hideDosing);

  await sleep(input.delayMs ?? ASSISTANT_DELAY_MS);

  // --- persist atomically ------------------------------------------------
  return prisma.$transaction(async (tx) => {
    if (wasEmpty) {
      const used = await tx.chatSession.count({ where: { ownerId, messageCount: { gt: 0 } } });
      if (used >= MAX_CHATS) throw new AppError(409, CHAT_LIMIT_MESSAGE);
    }

    let sessionId: string;
    let title: string;
    if (input.sessionId) {
      sessionId = input.sessionId;
      title = wasEmpty ? makeChatTitle(message) : (await tx.chatSession.findFirst({ where: { id: sessionId, ownerId }, select: { title: true } }))?.title ?? "New chat";
      const updated = await tx.chatSession.updateMany({
        where: wasEmpty
          ? { id: sessionId, ownerId, messageCount: 0 }
          : { id: sessionId, ownerId, messageCount: { lte: MAX_MESSAGES - 2 } },
        data: { messageCount: { increment: 2 }, updatedAt: new Date(), ...(wasEmpty ? { title } : {}) },
      });
      if (updated.count === 0) throw new AppError(409, wasEmpty ? CHAT_CHANGED_MESSAGE : MESSAGE_LIMIT_MESSAGE);
      if (wasEmpty) await tx.chatSession.deleteMany({ where: { ownerId, messageCount: 0 } });
    } else {
      // First message from /chat/new: reuse the owner's newest empty session or create one.
      title = makeChatTitle(message);
      const empty = await tx.chatSession.findFirst({
        where: { ownerId, messageCount: 0 },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      const data = {
        title,
        model: settings.model,
        temperature: settings.temperature,
        topP: settings.topP,
        systemPromptId: personaId,
        messageCount: 2,
      };
      if (empty) {
        await tx.chatSession.update({ where: { id: empty.id }, data });
        sessionId = empty.id;
      } else {
        sessionId = (await tx.chatSession.create({ data: { ownerId, ...data } })).id;
      }
      await tx.chatSession.deleteMany({ where: { ownerId, messageCount: 0 } });
    }

    const base = Date.now();
    const user = await tx.message.create({
      data: { sessionId, role: "user", content: message, productIds: [], createdAt: new Date(base) },
    });
    const assistant = await tx.message.create({
      data: {
        sessionId,
        role: "assistant",
        content: answer.content,
        productIds: snapshots.map((s) => s.productId),
        productSnapshots: snapshots as unknown as Prisma.InputJsonValue,
        createdAt: new Date(base + 1),
      },
    });

    const toDto = (m: typeof user, cards: CardDTO[]): MessageDTO => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      cards,
    });
    return {
      sessionId,
      title,
      user: toDto(user, []),
      assistant: toDto(
        assistant,
        snapshots.map((product) => ({ unavailable: false, product, linkAvailable: true })),
      ),
    };
  });
}
