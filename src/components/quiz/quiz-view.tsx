"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { ApiNotice } from "../api-notice";
import { Button } from "../ui/button";
import { ClientApiError, apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { QuizQuestion } from "@/lib/quiz";
import type { QuizResultDTO } from "@/server/quiz";

type Phase =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "locked"; message: string }
  | { name: "question"; questions: QuizQuestion[]; index: number; picked: number | null; score: number }
  | { name: "done"; score: number; total: number; saved: "saving" | "saved" | "failed" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function QuizView({ initialResults }: { initialResults: QuizResultDTO[] }) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [results, setResults] = useState(initialResults);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setPhase({ name: "loading" });
    try {
      const quiz = await apiFetch<{ questions: QuizQuestion[] }>("/api/quiz");
      setPhase({ name: "question", questions: quiz.questions, index: 0, picked: null, score: 0 });
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 409) {
        setPhase({ name: "locked", message: e.message });
      } else {
        setPhase({ name: "idle" });
        setError(e instanceof ClientApiError ? e.message : "Something went wrong. Please try again.");
      }
    }
  }

  async function saveResult(score: number, total: number) {
    setPhase({ name: "done", score, total, saved: "saving" });
    try {
      await apiFetch("/api/quiz/results", { method: "POST", body: { score, total } });
      const latest = await apiFetch<{ results: QuizResultDTO[] }>("/api/quiz/results");
      setResults(latest.results);
      setPhase({ name: "done", score, total, saved: "saved" });
    } catch {
      setPhase({ name: "done", score, total, saved: "failed" });
    }
  }

  function pick(optionIndex: number) {
    setPhase((p) => {
      if (p.name !== "question" || p.picked !== null) return p;
      const correct = optionIndex === p.questions[p.index].correctIndex;
      return { ...p, picked: optionIndex, score: p.score + (correct ? 1 : 0) };
    });
  }

  function next() {
    if (phase.name !== "question") return;
    if (phase.index + 1 >= phase.questions.length) void saveResult(phase.score, phase.questions.length);
    else setPhase({ ...phase, index: phase.index + 1, picked: null });
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">Quiz</h1>
        {error && <ApiNotice message={error} onRetry={start} />}

        {(phase.name === "idle" || phase.name === "loading") && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-700">
              Test what you have learned with 5 multiple-choice questions generated from the product catalogue.
            </p>
            <Button className="mt-4" onClick={start} disabled={phase.name === "loading"}>
              {phase.name === "loading" ? "Preparing quiz…" : "Start quiz"}
            </Button>
          </section>
        )}

        {phase.name === "locked" && (
          <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            {phase.message}
          </section>
        )}

        {phase.name === "question" && <QuestionCard phase={phase} onPick={pick} onNext={next} />}

        {phase.name === "done" && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm" aria-live="polite">
            <h2 className="text-lg font-semibold text-slate-900">Your score</h2>
            <p className="mt-1 text-3xl font-semibold text-teal-700">
              {phase.score} / {phase.total}
            </p>
            {phase.saved === "saving" && <p className="mt-2 text-sm text-slate-500">Saving your result…</p>}
            {phase.saved === "failed" && (
              <div className="mt-3 text-left">
                <ApiNotice message="We couldn’t save your result. Please try again." onRetry={() => void saveResult(phase.score, phase.total)} />
              </div>
            )}
            <Button className="mt-4" onClick={start}>
              Try again
            </Button>
          </section>
        )}

        <section aria-labelledby="last-results">
          <h2 id="last-results" className="text-sm font-semibold text-slate-900">
            Your last 10 results
          </h2>
          {results.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No results yet. Take the quiz to see your scores here.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {results.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="font-medium text-slate-900">
                    {r.score} / {r.total}
                  </span>
                  <time dateTime={r.createdAt} className="text-slate-500">
                    {formatDate(r.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function QuestionCard({
  phase,
  onPick,
  onNext,
}: {
  phase: Extract<Phase, { name: "question" }>;
  onPick: (index: number) => void;
  onNext: () => void;
}) {
  const q = phase.questions[phase.index];
  const answered = phase.picked !== null;
  const correct = answered && phase.picked === q.correctIndex;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500">
        Question {phase.index + 1} of {phase.questions.length}
      </p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">{q.text}</h2>
      <ul className="mt-4 space-y-2" role="list">
        {q.options.map((option, i) => {
          const isCorrect = answered && i === q.correctIndex;
          const isWrongPick = answered && i === phase.picked && !correct;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={answered}
                onClick={() => onPick(i)}
                aria-pressed={phase.picked === i}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                  !answered && "border-slate-300 hover:bg-slate-50",
                  isCorrect && "border-green-500 bg-green-50 text-green-900",
                  isWrongPick && "border-red-400 bg-red-50 text-red-900",
                  answered && !isCorrect && !isWrongPick && "border-slate-200 text-slate-500",
                )}
              >
                <span>{option}</span>
                {isCorrect && <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-label="Correct answer" />}
                {isWrongPick && <XCircle className="size-4 shrink-0 text-red-600" aria-label="Your answer" />}
              </button>
            </li>
          );
        })}
      </ul>
      {answered && (
        <div role="status" aria-live="polite" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          <p className={cn("font-semibold", correct ? "text-green-700" : "text-red-700")}>{correct ? "Correct!" : "Not quite."}</p>
          <p className="mt-1 text-slate-700">{q.explanation}</p>
          <Button className="mt-3" onClick={onNext}>
            {phase.index + 1 >= phase.questions.length ? "See my score" : "Next question"}
          </Button>
        </div>
      )}
    </section>
  );
}
