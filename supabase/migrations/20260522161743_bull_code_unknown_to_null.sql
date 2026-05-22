-- Stop storing the literal string 'Unknown' as a NAAB code. The UI treats
-- "Unknown" as "no code" and renders an em-dash, so the database may as well
-- store NULL.

-- 1. Allow NULL in tank_inventory.bull_code so writes can pass NULL when
--    the customer doesn't have a NAAB code for the bull.
ALTER TABLE public.tank_inventory
  ALTER COLUMN bull_code DROP NOT NULL;

-- 2. Backfill existing 'Unknown' placeholders to NULL across every table
--    that stores a denormalized bull_code copy.
UPDATE public.tank_inventory                    SET bull_code = NULL WHERE bull_code = 'Unknown';
UPDATE public.inventory_transactions            SET bull_code = NULL WHERE bull_code = 'Unknown';
UPDATE public.tank_pack_lines                   SET bull_code = NULL WHERE bull_code = 'Unknown';
UPDATE public.tank_unpack_lines                 SET bull_code = NULL WHERE bull_code = 'Unknown';
UPDATE public.shipment_lines                    SET bull_code = NULL WHERE bull_code = 'Unknown';
UPDATE public.project_billing_semen             SET bull_code = NULL WHERE bull_code = 'Unknown';
UPDATE public.project_billing_session_inventory SET bull_code = NULL WHERE bull_code = 'Unknown';

NOTIFY pgrst, 'reload schema';
