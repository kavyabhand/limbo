import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { QrCode } from "@/components/room/QrCode";
import { displayCode, displayDate, parseSlug, roomSlug } from "@/lib/shared/trip";
import { PrintButton } from "./PrintButton";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Printable room poster", robots: { index: false } };

export default async function PosterPage({ params }: Props) {
  const trip = parseSlug((await params).slug);
  if (!trip) notFound();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/r/${roomSlug(trip)}`;
  const mode = trip.mode === "flight" ? "flight" : trip.mode === "train" ? "train" : "bus";

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col items-center justify-center gap-6 bg-white px-8 py-12 text-center text-black print:min-h-0">
      <p className="text-xl">Delayed or cancelled?</p>
      <h1 className="text-5xl leading-tight font-bold tracking-tight">
        {mode === "flight" ? "Flight" : mode === "train" ? "Train" : "Bus"} {displayCode(trip)}
        <br />
        <span className="font-normal">{displayDate(trip.date, Date.parse(`${trip.date}T00:00:00Z`))}</span>
      </h1>
      <p className="text-2xl">Scan to talk to everyone else on this trip.</p>
      <QrCode value={url} size={300} label={`QR code for ${url}`} />
      <p className="text-base break-all text-neutral-600">{url}</p>
      <p className="text-base text-neutral-600">No app or sign-up. Updates come from other passengers.</p>
      <PrintButton />
    </main>
  );
}
