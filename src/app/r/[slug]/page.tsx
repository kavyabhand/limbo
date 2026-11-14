import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoomApp } from "@/components/room/RoomApp";
import { displayCode, displayDate, parseSlug, roomSlug } from "@/lib/shared/trip";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const trip = parseSlug((await params).slug);
  if (!trip) return { title: "Room not found" };
  const mode = trip.mode === "flight" ? "Flight" : trip.mode === "train" ? "Train" : "Bus";
  const title = `${mode} ${displayCode(trip)} · ${displayDate(trip.date, Date.now())}`;
  return {
    title,
    description: `Talk to everyone on ${mode.toLowerCase()} ${displayCode(trip)}. No sign-up.`,
    robots: { index: false },
    openGraph: { title, description: "Talk to everyone on this trip. No sign-up." },
  };
}

export default async function RoomPage({ params }: Props) {
  const { slug } = await params;
  const trip = parseSlug(slug);
  if (!trip) notFound();
  // Keyed by room so navigating between rooms never reuses another room's store.
  return <RoomApp key={roomSlug(trip)} trip={trip} />;
}
