-- Pronto initial schema (BACKEND_PLAN section 10, FLUJO_V2 section 8).
--
-- Conventions
--   * Money is numeric(20,7): 7 decimals, never a float. 1.0000000 = 10_000_000 stroops.
--   * Enums are CHECK constraints (not Postgres enum types) so they can evolve with a plain migration.
--     Values mirror packages/shared/src/contract.ts (InvoiceStatus, ChainStatus, AttachmentKind, mimes).
--   * Every table has RLS enabled and NO policies: the Supabase Data API (anon / authenticated) is
--     fully closed. Only the backend, connecting with DATABASE_URL (owner role), reads and writes.
--   * Any later migration that adds tables, views, sequences or functions to public MUST finish with
--     the "Lock down public" block at the bottom of this file (schema tests enforce it).

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.reject_audit_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only (% rejected)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  ruc           text not null,
  legal_name    text not null,
  sector        text not null,
  wallet        text not null,
  code          text not null,
  ficha_publica boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint companies_ruc_key unique (ruc),
  constraint companies_wallet_key unique (wallet),
  constraint companies_code_key unique (code),
  constraint companies_ruc_format check (ruc ~ '^[0-9]{11}$'),
  constraint companies_wallet_format check (wallet ~ '^G[A-Z2-7]{55}$'),
  -- Company code PR-XXXXXX, alphabet without 0 1 I L O U.
  constraint companies_code_format check (code ~ '^PR-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  constraint companies_legal_name_len check (char_length(legal_name) between 2 and 200),
  constraint companies_sector_len check (char_length(sector) between 2 and 80)
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auth_challenges (wallet-signature login, single-use nonce, 5 minutes)
-- ---------------------------------------------------------------------------

create table public.auth_challenges (
  nonce       text primary key,
  address     text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint auth_challenges_address_format check (address ~ '^G[A-Z2-7]{55}$'),
  constraint auth_challenges_expiry_after_creation check (expires_at > created_at)
);

create index auth_challenges_expires_at_idx on public.auth_challenges (expires_at);

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid not null references public.companies (id),
  buyer_id            uuid not null references public.companies (id),
  series              text not null,
  number              text not null,
  face_amount         numeric(20,7) not null,
  currency            text not null default 'USDC',
  issue_date          date not null,
  due_date            date not null,
  longer_term_agreed  boolean not null default false,
  max_discount_bps    integer,
  status              text not null default 'sent',
  rejection_reason    text,
  -- Optimistic concurrency token: the application increments it on every state change.
  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint invoices_supplier_series_number_key unique (supplier_id, series, number),
  constraint invoices_face_amount_positive check (face_amount > 0),
  constraint invoices_supplier_not_buyer check (supplier_id <> buyer_id),
  constraint invoices_due_after_issue check (due_date > issue_date),
  constraint invoices_max_discount_bps_range check (max_discount_bps is null or max_discount_bps between 0 and 5000),
  constraint invoices_status_check check (status in ('sent', 'rejected', 'confirmed', 'cancelled')),
  constraint invoices_currency_check check (currency = 'USDC'),
  constraint invoices_series_format check (series ~ '^[A-Z0-9]{4}$'),
  constraint invoices_number_format check (number ~ '^[0-9]{1,8}$'),
  constraint invoices_version_positive check (version >= 1)
);

create index invoices_buyer_id_idx on public.invoices (buyer_id, status);
create index invoices_supplier_id_idx on public.invoices (supplier_id, status);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- attachments
-- invoice_id is nullable: the upload URL is issued before the invoice exists
-- (CreateInvoiceRequest.attachmentIds references already-uploaded files).
-- ---------------------------------------------------------------------------

create table public.attachments (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid references public.invoices (id) on delete cascade,
  owner_company_id uuid not null references public.companies (id),
  kind             text not null,
  storage_path     text not null,
  mime             text not null,
  size_bytes       integer not null,
  sha256           text,
  status           text not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint attachments_storage_path_key unique (storage_path),
  constraint attachments_kind_check check (kind in ('pdf', 'image', 'xml')),
  constraint attachments_status_check check (status in ('pending', 'ready')),
  constraint attachments_mime_check check (
    mime in ('application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml')
  ),
  constraint attachments_kind_mime_match check (
    (kind = 'pdf' and mime = 'application/pdf')
    or (kind = 'image' and mime in ('image/jpeg', 'image/png'))
    or (kind = 'xml' and mime in ('application/xml', 'text/xml'))
  ),
  constraint attachments_size_bytes_range check (size_bytes > 0 and size_bytes <= 5242880),
  constraint attachments_sha256_format check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$')
);

create index attachments_invoice_id_idx on public.attachments (invoice_id);
create index attachments_owner_company_id_idx on public.attachments (owner_company_id);

create trigger attachments_set_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- offers (mirror of the on-chain offer; the network is the source of truth)
-- ---------------------------------------------------------------------------

create table public.offers (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices (id),
  offer_id_hex    text not null,
  net_amount      numeric(20,7) not null,
  discount_amount numeric(20,7) not null,
  discount_bps    integer not null,
  expires_at      timestamptz not null,
  chain_status    text not null default 'pending',
  tx_create       text,
  tx_accept       text,
  tx_reclaim      text,
  contract_id     text not null,
  accepted_at     timestamptz,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint offers_offer_id_hex_key unique (offer_id_hex),
  constraint offers_offer_id_hex_format check (offer_id_hex ~ '^[0-9a-f]{64}$'),
  constraint offers_net_amount_positive check (net_amount > 0),
  constraint offers_discount_amount_nonnegative check (discount_amount >= 0),
  constraint offers_discount_bps_range check (discount_bps between 1 and 5000),
  constraint offers_chain_status_check check (
    chain_status in ('pending', 'open', 'accepted', 'reclaimed', 'failed')
  ),
  constraint offers_tx_create_format check (tx_create is null or tx_create ~ '^[0-9a-f]{64}$'),
  constraint offers_tx_accept_format check (tx_accept is null or tx_accept ~ '^[0-9a-f]{64}$'),
  constraint offers_tx_reclaim_format check (tx_reclaim is null or tx_reclaim ~ '^[0-9a-f]{64}$')
);

-- At most ONE live offer per invoice. Once an offer is reclaimed or failed, a new one is allowed.
create unique index offers_one_live_per_invoice
  on public.offers (invoice_id)
  where chain_status in ('pending', 'open', 'accepted');

create index offers_invoice_id_idx on public.offers (invoice_id);
-- Reconciler work queue: offers whose on-chain state may still change.
create index offers_reconcile_idx on public.offers (last_checked_at)
  where chain_status in ('pending', 'open');

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invites (buyers not yet registered)
-- ---------------------------------------------------------------------------

create table public.invites (
  id              uuid primary key default gen_random_uuid(),
  from_company_id uuid not null references public.companies (id),
  target_ruc      text not null,
  token_hash      text not null,
  expires_at      timestamptz not null,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint invites_token_hash_key unique (token_hash),
  constraint invites_target_ruc_format check (target_ruc ~ '^[0-9]{11}$'),
  constraint invites_expiry_after_creation check (expires_at > created_at)
);

create index invites_from_company_id_idx on public.invites (from_company_id);
create index invites_target_ruc_idx on public.invites (target_ruc);

-- ---------------------------------------------------------------------------
-- rate_limits (fixed-window counters without extra services)
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start),
  constraint rate_limits_count_nonnegative check (count >= 0)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- audit_events (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id               bigint generated always as identity primary key,
  actor_company_id uuid,
  actor_wallet     text,
  action           text not null,
  entity_type      text,
  entity_id        text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint audit_events_action_not_blank check (char_length(action) > 0)
);

create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);
create index audit_events_created_at_idx on public.audit_events (created_at);

create trigger audit_events_no_update_delete
  before update or delete on public.audit_events
  for each row execute function public.reject_audit_mutation();

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function public.reject_audit_mutation();

-- ---------------------------------------------------------------------------
-- Views (security_invoker: they never bypass the caller's table privileges / RLS)
-- ---------------------------------------------------------------------------

-- One row per (company, counterparty): the contacts derived from invoices, from each side.
-- contact_role is the role the CONTACT plays toward company_id.
create view public.v_contacts with (security_invoker = true) as
select
  pairs.company_id,
  pairs.contact_id,
  pairs.contact_role,
  c.code        as contact_code,
  c.ruc         as contact_ruc,
  c.legal_name  as contact_legal_name,
  count(*)::integer      as invoice_count,
  max(pairs.created_at)  as last_invoice_at
from (
  select i.supplier_id as company_id, i.buyer_id as contact_id, 'buyer'::text as contact_role, i.created_at
  from public.invoices i
  union all
  select i.buyer_id as company_id, i.supplier_id as contact_id, 'supplier'::text as contact_role, i.created_at
  from public.invoices i
) pairs
join public.companies c on c.id = pairs.contact_id
group by pairs.company_id, pairs.contact_id, pairs.contact_role, c.code, c.ruc, c.legal_name;

-- Public track record of a buyer. The API only exposes rows where ficha_publica is true.
--   offers_funded     : offers the buyer put on chain (open, accepted or reclaimed)
--   offers_accepted   : offers the supplier collected
--   accepted_pct      : accepted / (accepted + reclaimed), NULL until one offer is resolved
--   avg_days_advanced : average days between collection and the invoice's original due date
--   distinct_suppliers: different suppliers that collected from this buyer
create view public.v_buyer_ficha with (security_invoker = true) as
select
  c.id            as buyer_id,
  c.code          as buyer_code,
  c.legal_name    as buyer_legal_name,
  c.ficha_publica,
  count(o.id) filter (where o.chain_status in ('open', 'accepted', 'reclaimed'))::integer as offers_funded,
  count(o.id) filter (where o.chain_status = 'accepted')::integer as offers_accepted,
  round(
    100.0 * count(o.id) filter (where o.chain_status = 'accepted')
    / nullif(count(o.id) filter (where o.chain_status in ('accepted', 'reclaimed')), 0),
    1
  ) as accepted_pct,
  round(
    avg(i.due_date - coalesce(o.accepted_at, o.updated_at)::date) filter (where o.chain_status = 'accepted'),
    1
  ) as avg_days_advanced,
  count(distinct i.supplier_id) filter (where o.chain_status = 'accepted')::integer as distinct_suppliers
from public.companies c
left join public.invoices i on i.buyer_id = c.id
left join public.offers o on o.invoice_id = i.id
group by c.id, c.code, c.legal_name, c.ficha_publica;

-- ---------------------------------------------------------------------------
-- Row level security: enabled everywhere, NO policies (direct access denied)
-- ---------------------------------------------------------------------------

alter table public.companies       enable row level security;
alter table public.auth_challenges enable row level security;
alter table public.invoices        enable row level security;
alter table public.attachments     enable row level security;
alter table public.offers          enable row level security;
alter table public.invites         enable row level security;
alter table public.rate_limits     enable row level security;
alter table public.audit_events    enable row level security;

-- ---------------------------------------------------------------------------
-- Private storage bucket for invoice files (5 MiB, restricted mime types)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/xml', 'text/xml']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Lock down public: anon and authenticated get nothing, now or by default.
-- Keep this block LAST in every migration that adds objects to public.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Supabase also installs default privileges for supabase_admin; clean them when we are allowed to.
do $$
begin
  alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated;
  alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated;
  alter default privileges for role supabase_admin in schema public revoke all on functions from anon, authenticated;
exception when insufficient_privilege then
  raise notice 'skipped supabase_admin default privileges (insufficient privilege)';
end;
$$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
-- Functions are executable by PUBLIC by default; close that too.
revoke execute on all functions in schema public from public;
