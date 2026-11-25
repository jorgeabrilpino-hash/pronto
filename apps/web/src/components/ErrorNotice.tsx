import { userMessage } from '@/api/errors';
import { Button } from './Button';
import { IconAlert } from './icons';

interface Props {
  error: unknown;
  /** Overrides the button label and handler (one sentence, one button). */
  onAction?: () => void;
  actionLabel?: string | undefined;
}

/** One sentence and one button. No codes, no traces (DESIGN.md section 6). */
export function ErrorNotice({ error, onAction, actionLabel }: Props) {
  const m = userMessage(error);
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-danger bg-danger-tint p-4"
    >
      <p className="flex items-center gap-2 font-semibold text-danger">
        <IconAlert />
        <span>{m.message}</span>
      </p>
      {onAction ? (
        <Button variant="secondary" onClick={onAction} className="self-start">
          {actionLabel ?? m.action}
        </Button>
      ) : null}
    </div>
  );
}
