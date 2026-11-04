import { getOwnerId, json, readJsonBody, validationError } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { validateQuizResult } from "@/lib/validation";
import { listQuizResults, saveQuizResult } from "@/server/quiz";
import { errorToResponse, prepareWrite, withCookie } from "@/server/route-helpers";

/** GET /api/quiz/results: the current owner's latest 10 results, newest first. */
export async function GET(request: Request) {
  try {
    return json({ results: await listQuizResults(getPrisma(), getOwnerId(request)) });
  } catch (error) {
    return errorToResponse(error);
  }
}

/**
 * POST /api/quiz/results: body is exactly { score, total } (integers,
 * total === 5, 0 <= score <= total). The owner comes only from the cookie.
 * Scores are reported by the browser and are not suitable for grading.
 */
export async function POST(request: Request) {
  const prepared = prepareWrite(request, ["POST"]);
  if (!prepared.ok) return prepared.response;
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const checked = validateQuizResult(body.value);
    if (!checked.ok) return validationError(checked.errors);
    const result = await saveQuizResult(getPrisma(), prepared.ctx.ownerId, checked.value);
    return withCookie(json({ result }, 201), prepared.ctx);
  } catch (error) {
    return errorToResponse(error);
  }
}

