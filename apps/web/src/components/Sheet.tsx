import { type ReactNode, useEffect } from 'react';

interface SheetProps {
  open: boolean;
  title: string;
  children: ReactNode;
  /** When set, the backdrop and Escape close the sheet. Omit to lock it (network operation). */
  onClose?: (() => void) | undefined;
}

/** Bottom sheet on phones, centered dialog on desktop. Hard borders, no soft shadows. */
export function Sheet({ open, title, children, onClose }: SheetProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      {onClose ? (
        <button
          type="button"
          aria-label="Cerrar fondo"
          tabIndex={-1}
          onClick={onClose}
          className="absolute inset-0 bg-ink/60"
        />
      ) : (
        <div className="absolute inset-0 bg-ink/60" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto border-2 border-b-0 border-ink bg-paper px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-sheet [animation:sheet-in_180ms_ease-out] lg:border-b-2 lg:px-6 lg:pb-6 lg:shadow-hard"
      >
        <span className="mx-auto h-1.5 w-10 bg-ink lg:hidden" />
        <h2 className="display text-[30px]">{title}</h2>
        {children}
      </div>
    </div>
  );
}
