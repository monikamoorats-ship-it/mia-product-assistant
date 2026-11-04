import Link from "next/link";

export default function ChatNotFound() {
  return (
    <div className="p-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Chat not found</h1>
      <p className="mt-2 text-sm text-slate-600">This chat doesn’t exist or is no longer available.</p>
      <Link href="/chat/new" prefetch={false} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700">
        Start a new chat
      </Link>
    </div>
  );
}
