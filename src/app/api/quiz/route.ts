import { getOwnerId, json } from "@/lib/api";
import { getPrisma } from "@/lib/db";
import { createQuiz } from "@/server/quiz";
import { errorToResponse } from "@/server/route-helpers";

/**
 * GET /api/quiz: five generated questions from the products visible to the
 * current owner. Returns 409 "Add more varied products to unlock the quiz."
 * when five valid questions cannot be built. Nothing is logged.
 */
export async function GET(request: Request) {
  try {
    return json(await createQuiz(getPrisma(), getOwnerId(request)));
  } catch (error) {
    return errorToResponse(error);
  }
}
