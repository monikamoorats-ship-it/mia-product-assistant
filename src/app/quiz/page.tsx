import { cookies } from "next/headers";
import { DbUnavailable } from "@/components/db-unavailable";
import { QuizView } from "@/components/quiz/quiz-view";
import { getPrisma } from "@/lib/db";
import { logDbError } from "@/lib/log-error";
import { OWNER_COOKIE, ownerIdFromCookie } from "@/lib/owner";
import { listQuizResults, type QuizResultDTO } from "@/server/quiz";

export default async function QuizPage() {
  const ownerId = ownerIdFromCookie((await cookies()).get(OWNER_COOKIE)?.value);
  let results: QuizResultDTO[];
  try {
    results = await listQuizResults(getPrisma(), ownerId);
  } catch (error) {
    logDbError("page-quiz", error);
    return <DbUnavailable />;
  }
  return <QuizView initialResults={results} />;
}
