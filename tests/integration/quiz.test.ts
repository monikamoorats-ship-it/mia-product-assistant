/** Quiz API integration tests. CI only (disposable PostgreSQL). */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { MAX_STORED_RESULTS, SHOWN_RESULTS, createQuiz, listQuizResults, saveQuizResult } from "@/server/quiz";
import { QUIZ_UNAVAILABLE_MESSAGE, isValidQuiz } from "@/lib/quiz";
import { OWNER_A, OWNER_B, customProduct, prisma, resetAndSeed } from "./helpers";

beforeEach(resetAndSeed);
afterAll(() => prisma.$disconnect());

describe("quiz generation from the database", () => {
  it("builds five valid questions from the seeded catalogue", async () => {
    const quiz = await createQuiz(prisma, OWNER_A);
    expect(quiz.quizId).toMatch(/^[0-9a-f-]{36}$/);
    expect(isValidQuiz(quiz.questions)).toBe(true);
  });

  it("works for a visitor without an owner (seeded products only)", async () => {
    expect(isValidQuiz((await createQuiz(prisma, null)).questions)).toBe(true);
  });

  it("is locked with the friendly message when fewer than four products are visible", async () => {
    await prisma.product.deleteMany({ where: { seedKey: { in: ["loperamide-2mg-capsules", "omeprazole-20mg-capsules", "vitamin-d3-1000iu-tablets", "cetirizine-10mg-tablets"] } } });
    const error = await createQuiz(prisma, OWNER_A).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).toBe(QUIZ_UNAVAILABLE_MESSAGE);
  });

  it("includes the owner's custom products but never another owner's", async () => {
    await customProduct(OWNER_B, { name: "Their secret balm", activeSubstance: "secretium", useFor: "Secret skin", tip: "Secret tip" });
    await customProduct(OWNER_A, { name: "My own balm", activeSubstance: "ownium", useFor: "Own skin", tip: "Own tip" });
    for (let i = 0; i < 15; i++) {
      const json = JSON.stringify((await createQuiz(prisma, OWNER_A)).questions);
      expect(json).not.toContain("Their secret balm");
      expect(json).not.toContain("secretium");
    }
  });
});

describe("quiz results", () => {
  it("stores results for the current owner and shows the latest 10, newest first", async () => {
    for (let score = 0; score <= 5; score++) await saveQuizResult(prisma, OWNER_A, { score, total: 5 });
    for (let i = 0; i < 6; i++) await saveQuizResult(prisma, OWNER_A, { score: 5, total: 5 });
    const shown = await listQuizResults(prisma, OWNER_A);
    expect(shown).toHaveLength(SHOWN_RESULTS);
    const times = shown.map((r) => new Date(r.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("isolates history between owners", async () => {
    await saveQuizResult(prisma, OWNER_A, { score: 3, total: 5 });
    await saveQuizResult(prisma, OWNER_B, { score: 5, total: 5 });
    expect((await listQuizResults(prisma, OWNER_A)).map((r) => r.score)).toEqual([3]);
    expect((await listQuizResults(prisma, OWNER_B)).map((r) => r.score)).toEqual([5]);
    expect(await listQuizResults(prisma, null)).toEqual([]);
  });

  it("prunes the OLDEST results beyond 100 in the same transaction", async () => {
    // Seed 100 results with strictly increasing timestamps; score encodes age (0 = oldest).
    const base = Date.now() - 200_000;
    await prisma.quizResult.createMany({
      data: Array.from({ length: MAX_STORED_RESULTS }, (_, i) => ({ ownerId: OWNER_A, score: i % 6, total: 5, createdAt: new Date(base + i * 1000) })),
    });
    await prisma.quizResult.create({ data: { ownerId: OWNER_B, score: 1, total: 5 } });
    const oldest = await prisma.quizResult.findFirstOrThrow({ where: { ownerId: OWNER_A }, orderBy: { createdAt: "asc" } });

    const added = await saveQuizResult(prisma, OWNER_A, { score: 5, total: 5 });

    expect(await prisma.quizResult.count({ where: { ownerId: OWNER_A } })).toBe(MAX_STORED_RESULTS);
    expect(await prisma.quizResult.findUnique({ where: { id: oldest.id } })).toBeNull();
    expect(await prisma.quizResult.findUnique({ where: { id: added.id } })).not.toBeNull();
    expect(await prisma.quizResult.count({ where: { ownerId: OWNER_B } })).toBe(1);
  });

  it("the database itself rejects totals other than 5 and impossible scores", async () => {
    await expect(prisma.quizResult.create({ data: { ownerId: OWNER_A, score: 3, total: 4 } })).rejects.toThrow();
    await expect(prisma.quizResult.create({ data: { ownerId: OWNER_A, score: 6, total: 5 } })).rejects.toThrow();
  });
});
