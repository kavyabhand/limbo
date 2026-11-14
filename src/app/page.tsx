import Link from "next/link";
import { TripForm } from "@/components/landing/TripForm";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <header>
        <Link href="/" className="text-[1.05rem] font-semibold tracking-tight">
          Limbo
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-[2rem] leading-[1.15] font-semibold tracking-tight">Trip stuck in limbo?</h1>
        <p className="mt-3 text-[1.05rem] text-ink-2">
          Flight delayed, train stuck, bus broken down? Talk to everyone else on it. No sign-up.
        </p>

        <div className="mt-8">
          <TripForm />
        </div>
      </main>

      <footer className="text-[0.85rem] leading-relaxed text-ink-3">
        <p>
          <Link href="/demo" className="font-medium text-ink underline underline-offset-4">
            Try a demo room
          </Link>{" "}
          to see how it works.
        </p>
        <p className="mt-3">Updates come from other passengers, not airlines or railways. Check anything important with your operator.</p>
      </footer>
    </div>
  );
}
