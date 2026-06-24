-- Separate ORIGIN (where stock was ordered from) from OWNER (who owns it).
--
-- owner_company_id already records the OWNER, which the business rules limit to
-- companies flagged can_own_inventory = true (CATL Resources, Select Sires) — or
-- a customer via customer_id. ORIGIN is provenance only: the company the semen
-- was ordered from (Select, ABS, Genex, ORIgen, …), which can be any company and
-- never implies ownership. Keeping them in one field let an origin-only supplier
-- be picked as an "owner", so we give origin its own nullable column.
alter table public.tank_inventory
  add column if not exists origin_company_id uuid references public.semen_companies(id);

comment on column public.tank_inventory.origin_company_id is
  'Provenance: the semen company this stock was ordered from (any company). Distinct from owner_company_id (the owner, limited to can_own_inventory companies) and customer_id (customer-owned stock).';
