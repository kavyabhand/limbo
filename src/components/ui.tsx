"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/* ------------------------------------------------------------------ Sheet */

/**
 * Bottom sheet on phones, centred dialog on larger screens. Built on <dialog>
 * so focus trapping, Esc to close and an inert background come from the browser.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop
      }}
      className={`m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-hidden rounded-t-[20px] bg-bg p-0 text-ink sm:m-auto sm:rounded-[20px] ${
        wide ? "sm:max-w-xl" : "sm:max-w-md"
      }`}
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-subtle-2 sm:hidden" aria-hidden />
          <header className="flex items-center gap-2 px-5 pt-3 pb-1 sm:pt-5">
            <h2 id={titleId} className="min-w-0 flex-1 text-[1.15rem] font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="-mr-2 grid size-10 place-items-center rounded-full text-ink-3 hover:bg-subtle" aria-label="Close">
              <CloseIcon width={18} height={18} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">{children}</div>
          {footer ? <footer className="px-5 pt-1 pb-[max(env(safe-area-inset-bottom),1rem)]">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/* ------------------------------------------------------------------ Toast */

type Toast = { id: number; text: string; tone: "info" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <p
            key={t.id}
            className={`fade-up max-w-sm rounded-full px-4 py-2 text-[0.9rem] font-medium shadow-lg ${t.tone === "error" ? "bg-danger text-on-color" : "bg-primary text-primary-ink"}`}
          >
            {t.text}
          </p>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------------------------------------------------------------- Options */

/** A single choice in a small set. Selected = filled; otherwise plain text on a light surface. */
export function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-10 rounded-full px-3.5 text-[0.95rem] transition-colors ${
        selected ? "bg-primary font-medium text-primary-ink" : "bg-subtle text-ink-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, htmlFor, hint }: { label: string; children: ReactNode; htmlFor: string; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[0.9rem] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[0.85rem] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "h-12 w-full rounded-xl border-0 bg-subtle px-4 text-base text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-[var(--focus)]";

export function Button({
  children,
  busy,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-primary text-primary-ink",
    secondary: "bg-subtle text-ink",
    danger: "bg-subtle text-danger",
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      disabled={busy || rest.disabled}
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-opacity disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-3 text-[0.9rem] text-danger">
      {children}
    </p>
  );
}
