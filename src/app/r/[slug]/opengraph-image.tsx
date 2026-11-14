import { ImageResponse } from "next/og";
import { displayCode, displayDate, parseSlug } from "@/lib/shared/trip";

export const alt = "A Limbo trip room";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview for a trip room, so a shared link says which trip it is for. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const trip = parseSlug((await params).slug);
  const mode = trip ? (trip.mode === "flight" ? "Flight" : trip.mode === "train" ? "Train" : "Bus") : "";
  const title = trip ? `${mode} ${displayCode(trip)}` : "Limbo";
  const date = trip ? displayDate(trip.date, Date.parse(`${trip.date}T00:00:00Z`)) : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0c0c0d", padding: 80, color: "#f4f4f5" }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: "#a1a1aa" }}>Limbo</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: -3 }}>{title}</div>
          {date ? <div style={{ fontSize: 56, color: "#fbbf24", marginTop: 4 }}>{date}</div> : null}
          <div style={{ fontSize: 40, color: "#a1a1aa", marginTop: 32 }}>Talk to everyone else on this trip. No sign-up.</div>
        </div>
      </div>
    ),
    size,
  );
}
