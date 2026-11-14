"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-12 rounded-xl bg-black px-6 font-semibold text-white print:hidden">
      Print
    </button>
  );
}
