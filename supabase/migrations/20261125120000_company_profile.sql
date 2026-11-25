-- Company profile chosen at registration: what the company does on Pronto.
-- supplier sends invoices; buyer confirms them and pays early; both does everything.
-- The app adapts to it instead of asking "seller or buyer" at every login.
alter table public.companies
  add column profile text not null default 'both';
alter table public.companies
  add constraint companies_profile_check check (profile in ('supplier', 'buyer', 'both'));
