import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  suffix?: ReactNode;
  mono?: boolean;
}

/** 52 px field with persistent mono label and inline validation. */
export function Field({ label, error, hint, suffix, mono, id, ...rest }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="label text-muted">
        {label}
      </label>
      <div
        className={`flex h-[52px] items-center border-2 bg-card px-3 focus-within:shadow-[3px_3px_0_#ff5a1f] ${
          error ? 'border-danger' : 'border-ink'
        }`}
      >
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/60 ${
            mono ? 'tabular' : ''
          }`}
          {...rest}
        />
        {suffix ? <span className="tabular pl-2 text-sm text-muted">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={`${fieldId}-err`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
