import { useEffect, useId, useRef, type ReactNode } from "react";

/** Native <dialog>: focus trap and Esc for free. The cancel button gets the initial focus (safe default for destructive actions). */
export function ConfirmDialog({ aberto, titulo, onFechar, children }: { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId(); // unique per dialog: several can be mounted at once (help, pause, remove)
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog ref={ref} aria-labelledby={tid} onClose={onFechar}>
      <h2 id={tid}>{titulo}</h2>
      {children}
    </dialog>
  );
}
