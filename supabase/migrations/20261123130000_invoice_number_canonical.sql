-- Invoice numbers are stored in canonical form: no leading zeros and never zero.
-- Without this, "0123" and "123" would both satisfy the unique (supplier_id, series, number)
-- constraint and the same invoice could be registered, and financed, twice.
-- The application strips leading zeros before inserting; this check is the last line of defense.
alter table public.invoices drop constraint invoices_number_format;
alter table public.invoices
  add constraint invoices_number_format check (number ~ '^[1-9][0-9]{0,7}$');
