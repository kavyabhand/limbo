import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <p className="text-[1.5rem] font-semibold tracking-tight">This page doesn&apos;t exist</p>
      <p className="mt-2 text-ink-2">Check the link, or find your trip from the start.</p>
      <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-xl bg-primary px-6 font-semibold text-primary-ink">
        Find my trip
      </Link>
    </main>
  );
}
