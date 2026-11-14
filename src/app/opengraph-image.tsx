import { ImageResponse } from "next/og";

export const alt = "Limbo: trip stuck in limbo? Talk to everyone else on it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview for the site: a quiet departure board and the promise. */
export default function Image() {
  const rows = [
    ["#2a2a2e", "#2a2a2e", "#2a2a2e", "#2a2a2e"],
    ["#fbbf24", "#fbbf24", "#2a2a2e", "#2a2a2e"],
    ["#2a2a2e", "#f87171", "#f87171", "#2a2a2e"],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0c0c0d", padding: 80, color: "#f4f4f5" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              {r.map((c, j) => (
                <div key={j} style={{ width: 64, height: 40, borderRadius: 6, background: c }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>Limbo</div>
          <div style={{ fontSize: 40, color: "#a1a1aa", marginTop: 8 }}>Trip stuck in limbo? Talk to everyone else on it.</div>
        </div>
      </div>
    ),
    size,
  );
}
