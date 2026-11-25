-- Demo data for the Pronto video. Fictional companies, USDC only. Idempotent: safe to run many times.
--
-- RUCs use the SUNAT check digit (module 11, weights 5,4,3,2,7,6,5,4,3,2 over the first 10 digits).
-- Wallets are public testnet addresses. Transaction hashes, contract id and attachment files below are
-- placeholders: they do not exist on the network or in the storage bucket.

-- ---------------------------------------------------------------------------
-- Companies: buyer and supplier (profile matches their side in the demo)
-- ---------------------------------------------------------------------------

insert into public.companies (id, ruc, legal_name, sector, wallet, code, ficha_publica, profile)
values
  ('c0000000-0000-4000-8000-000000000001', '20604123985', 'Constructora Andina del Sur S.A.C.',
   'Construccion', 'GABXMVQFX6R74OUC6TGL3YGO7TLGV7R34RVAGTJE42UUXCVA4IELCKU3', 'PR-7KM2QX', true, 'buyer'),
  ('c0000000-0000-4000-8000-000000000002', '20605871241', 'Textiles Pacha Mama E.I.R.L.',
   'Textil y confeccion', 'GCKU5G3MCJD4HM44QCK2E3D3Y6AIC3YZNG2EZ2HRWT4CF6LNSUWWVQTY', 'PR-B4N9TW', false, 'supplier')
on conflict (id) do update set
  ruc = excluded.ruc,
  legal_name = excluded.legal_name,
  sector = excluded.sector,
  wallet = excluded.wallet,
  code = excluded.code,
  ficha_publica = excluded.ficha_publica,
  profile = excluded.profile;

-- ---------------------------------------------------------------------------
-- Invoices (supplier Textiles Pacha Mama -> buyer Constructora Andina del Sur)
--   101 sent        102 rejected     103 confirmed + open offer     104 confirmed + accepted offer
--   105 confirmed + reclaimed offer  106 confirmed + failed and pending offers   107 cancelled
-- ---------------------------------------------------------------------------

insert into public.invoices
  (id, supplier_id, buyer_id, series, number, face_amount, currency, issue_date, due_date,
   longer_term_agreed, max_discount_bps, status, rejection_reason)
values
  ('a1000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'F001', '101', 12500.0000000, 'USDC',
   '2026-11-10', '2027-01-15', false, 300, 'sent', null),
  ('a1000000-0000-4000-8000-000000000102', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'F001', '102', 8200.5000000, 'USDC',
   '2026-11-08', '2027-01-08', false, null, 'rejected', 'El monto no coincide con la orden de compra'),
  ('a1000000-0000-4000-8000-000000000103', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'F001', '103', 25000.0000000, 'USDC',
   '2026-11-05', '2027-01-20', true, 500, 'confirmed', null),
  ('a1000000-0000-4000-8000-000000000104', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'F001', '104', 18400.0000000, 'USDC',
   '2026-10-20', '2027-01-10', false, 400, 'confirmed', null),
  ('a1000000-0000-4000-8000-000000000105', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'F001', '105', 9600.0000000, 'USDC',
   '2026-10-15', '2026-12-30', false, null, 'confirmed', null),
  ('a1000000-0000-4000-8000-000000000106', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'F001', '106', 14750.2500000, 'USDC',
   '2026-11-12', '2027-01-25', false, 250, 'confirmed', null),
  ('a1000000-0000-4000-8000-000000000107', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', 'F001', '107', 3150.0000000, 'USDC',
   '2026-11-01', '2026-12-31', false, null, 'cancelled', null)
on conflict (id) do update set
  supplier_id = excluded.supplier_id,
  buyer_id = excluded.buyer_id,
  series = excluded.series,
  number = excluded.number,
  face_amount = excluded.face_amount,
  currency = excluded.currency,
  issue_date = excluded.issue_date,
  due_date = excluded.due_date,
  longer_term_agreed = excluded.longer_term_agreed,
  max_discount_bps = excluded.max_discount_bps,
  status = excluded.status,
  rejection_reason = excluded.rejection_reason;

-- ---------------------------------------------------------------------------
-- Attachments (rows only: there is no file behind storage_path)
-- ---------------------------------------------------------------------------

insert into public.attachments
  (id, invoice_id, owner_company_id, kind, storage_path, mime, size_bytes, sha256, status)
values
  ('d0000000-0000-4000-8000-000000000101', 'a1000000-0000-4000-8000-000000000101',
   'c0000000-0000-4000-8000-000000000002', 'pdf',
   encode(sha256('seed-attachment-101'::bytea), 'hex') || '.pdf', 'application/pdf', 184320,
   encode(sha256('seed-file-101'::bytea), 'hex'), 'ready'),
  ('d0000000-0000-4000-8000-000000000103', 'a1000000-0000-4000-8000-000000000103',
   'c0000000-0000-4000-8000-000000000002', 'pdf',
   encode(sha256('seed-attachment-103'::bytea), 'hex') || '.pdf', 'application/pdf', 201728,
   encode(sha256('seed-file-103'::bytea), 'hex'), 'ready'),
  ('d0000000-0000-4000-8000-000000000113', 'a1000000-0000-4000-8000-000000000103',
   'c0000000-0000-4000-8000-000000000002', 'xml',
   encode(sha256('seed-attachment-113'::bytea), 'hex') || '.xml', 'application/xml', 9216,
   encode(sha256('seed-file-113'::bytea), 'hex'), 'ready')
on conflict (id) do update set
  invoice_id = excluded.invoice_id,
  owner_company_id = excluded.owner_company_id,
  kind = excluded.kind,
  storage_path = excluded.storage_path,
  mime = excluded.mime,
  size_bytes = excluded.size_bytes,
  sha256 = excluded.sha256,
  status = excluded.status;

-- ---------------------------------------------------------------------------
-- Offers in every chain_status. net_amount = face_amount - discount_amount.
--   103 open (collectable now)      104 accepted (collected)
--   105 reclaimed (expired)         106 failed, then a new pending offer (allowed by the partial index)
-- ---------------------------------------------------------------------------

insert into public.offers
  (id, invoice_id, offer_id_hex, net_amount, discount_amount, discount_bps, expires_at, chain_status,
   tx_create, tx_accept, tx_reclaim, contract_id, accepted_at, last_checked_at)
values
  ('b0000000-0000-4000-8000-000000000103', 'a1000000-0000-4000-8000-000000000103',
   encode(sha256('seed-offer-103'::bytea), 'hex'), 24625.0000000, 375.0000000, 150,
   now() + interval '12 days', 'open',
   encode(sha256('seed-tx-create-103'::bytea), 'hex'), null, null,
   'CDEMOSEEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', null, now()),
  ('b0000000-0000-4000-8000-000000000104', 'a1000000-0000-4000-8000-000000000104',
   encode(sha256('seed-offer-104'::bytea), 'hex'), 18032.0000000, 368.0000000, 200,
   now() + interval '3 days', 'accepted',
   encode(sha256('seed-tx-create-104'::bytea), 'hex'), encode(sha256('seed-tx-accept-104'::bytea), 'hex'), null,
   'CDEMOSEEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', now() - interval '5 days', now()),
  ('b0000000-0000-4000-8000-000000000105', 'a1000000-0000-4000-8000-000000000105',
   encode(sha256('seed-offer-105'::bytea), 'hex'), 9504.0000000, 96.0000000, 100,
   now() - interval '2 days', 'reclaimed',
   encode(sha256('seed-tx-create-105'::bytea), 'hex'), null, encode(sha256('seed-tx-reclaim-105'::bytea), 'hex'),
   'CDEMOSEEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', null, now()),
  ('b0000000-0000-4000-8000-000000000116', 'a1000000-0000-4000-8000-000000000106',
   encode(sha256('seed-offer-106-failed'::bytea), 'hex'), 14573.2470000, 177.0030000, 120,
   now() + interval '10 days', 'failed',
   null, null, null,
   'CDEMOSEEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', null, now()),
  ('b0000000-0000-4000-8000-000000000106', 'a1000000-0000-4000-8000-000000000106',
   encode(sha256('seed-offer-106'::bytea), 'hex'), 14602.7475000, 147.5025000, 100,
   now() + interval '10 days', 'pending',
   null, null, null,
   'CDEMOSEEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', null, null)
on conflict (id) do update set
  invoice_id = excluded.invoice_id,
  offer_id_hex = excluded.offer_id_hex,
  net_amount = excluded.net_amount,
  discount_amount = excluded.discount_amount,
  discount_bps = excluded.discount_bps,
  expires_at = excluded.expires_at,
  chain_status = excluded.chain_status,
  tx_create = excluded.tx_create,
  tx_accept = excluded.tx_accept,
  tx_reclaim = excluded.tx_reclaim,
  contract_id = excluded.contract_id,
  accepted_at = excluded.accepted_at,
  last_checked_at = excluded.last_checked_at;
