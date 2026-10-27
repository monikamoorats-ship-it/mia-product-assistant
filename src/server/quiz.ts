/** Owner-scoped quiz generation and result history. Never logs answers or scores. */
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { QUIZ_UNAVAILABLE_MESSAGE, generateQuiz, type QuizQuestion } from "@/lib/quiz";
import { AppError } from "./errors";

type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_STORED_RESULTS = 100;
export const SHOWN_RESULTS = 10;

export type QuizDTO = { quizId: string; questions: QuizQuestion[] };
export type QuizResultDTO = { id: string; score: number; total: number; createdAt: string };

/**
 * Builds a quiz from the seeded products plus the owner's custom products.
 * The correct option is included so the browser can give instant feedback.
 */
export async function createQuiz(db: Db, ownerId: string | null): Promise<QuizDTO> {
  const products = await db.product.findMany({
    where: ownerId ? { OR: [{ ownerId: null }, { ownerId }] } : { ownerId: null },
    select: { id: true, name: true, activeSubstance: true, category: true, useFor: true, tip: true },
    orderBy: { id: "asc" },
  });
  const questions = generateQuiz(products);
  if (!questions) throw new AppError(409, QUIZ_UNAVAILABLE_MESSAGE);
  return { quizId: randomUUID(), questions };
}

/** The owner's latest 10 completed results, newest first. */
export async function listQuizResults(db: Db, ownerId: string | null): Promise<QuizResultDTO[]> {
  if (!ownerId) return [];
  const rows = await db.quizResult.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: SHOWN_RESULTS,
  });
  return rows.map((r) => ({ id: r.id, score: r.score, total: r.total, createdAt: r.createdAt.toISOString() }));
}

/**
 * Stores a result for the owner and, in the same transaction, prunes the
 * oldest results so that only the newest 100 remain.
 */
export async function saveQuizResult(prisma: PrismaClient, ownerId: string, result: { score: number; total: number }): Promise<QuizResultDTO> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.quizResult.create({ data: { ownerId, score: result.score, total: result.total } });
    const keep = await tx.quizResult.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_STORED_RESULTS,
      select: { id: true },
    });
    await tx.quizResult.deleteMany({ where: { ownerId, id: { notIn: keep.map((r) => r.id) } } });
    return { id: created.id, score: created.score, total: created.total, createdAt: created.createdAt.toISOString() };
  });
}
