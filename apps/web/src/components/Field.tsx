import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  suffix?: ReactNode;
  mono?: boolean;
}

/** 52 px field with persistent label and inline validation (DESIGN.md 5.5). */
export function Field({ label, error, hint, suffix, mono, id, ...rest }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  const describedBy = error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={`flex h-[52px] items-center rounded-field border bg-ivory px-3 focus-within:border-2 focus-within:border-ink ${
          error ? 'border-danger' : 'border-line'
        }`}
      >
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/70 ${
            mono ? 'tabular' : ''
          }`}
          {...rest}
        />
        {suffix ? <span className="tabular pl-2 text-sm text-muted">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={`${fieldId}-err`} className="text-sm text-danger">
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
