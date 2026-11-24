import { type ReactNode, useEffect } from 'react';

interface SheetProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** When set, the backdrop and Escape close the sheet. Omit to lock it (network operation). */
  onClose?: (() => void) | undefined;
}

/** Bottom sheet: ivory, 24 px top corners, hard shadow (DESIGN.md 5.4). */
export function Sheet({ open, title, children, onClose }: SheetProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex w-full max-w-[480px] flex-col gap-4 rounded-t-[24px] border border-b-0 border-line bg-ivory px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-sheet [animation:sheet-in_180ms_ease-out]"
      >
        <span className="mx-auto h-1 w-8 rounded-full bg-line" />
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
