-- Cascade bull_name / naab_code changes from bulls_catalog into all tables
-- that store denormalized copies via a bull_catalog_id FK. Without this,
-- editing a bull in the catalog leaves stale copies in tank_inventory,
-- inventory_transactions, tank_pack_lines, tank_unpack_lines, shipment_lines,
-- project_billing_semen, and project_billing_session_inventory.

CREATE OR REPLACE FUNCTION public.cascade_bull_catalog_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when name or code actually changed.
  IF OLD.bull_name IS DISTINCT FROM NEW.bull_name
     OR OLD.naab_code IS DISTINCT FROM NEW.naab_code THEN

    UPDATE tank_inventory
    SET bull_code = NEW.naab_code
    WHERE bull_catalog_id = NEW.id
      AND bull_code IS DISTINCT FROM NEW.naab_code;

    UPDATE inventory_transactions
    SET bull_code = NEW.naab_code
    WHERE bull_catalog_id = NEW.id
      AND bull_code IS DISTINCT FROM NEW.naab_code;

    UPDATE tank_pack_lines
    SET bull_code = NEW.naab_code,
        bull_name = NEW.bull_name
    WHERE bull_catalog_id = NEW.id
      AND (bull_code IS DISTINCT FROM NEW.naab_code
           OR bull_name IS DISTINCT FROM NEW.bull_name);

    UPDATE tank_unpack_lines
    SET bull_code = NEW.naab_code,
        bull_name = NEW.bull_name
    WHERE bull_catalog_id = NEW.id
      AND (bull_code IS DISTINCT FROM NEW.naab_code
           OR bull_name IS DISTINCT FROM NEW.bull_name);

    UPDATE shipment_lines
    SET bull_code = NEW.naab_code
    WHERE bull_catalog_id = NEW.id
      AND bull_code IS DISTINCT FROM NEW.naab_code;

    UPDATE project_billing_semen
    SET bull_code = NEW.naab_code,
        bull_name = NEW.bull_name
    WHERE bull_catalog_id = NEW.id
      AND (bull_code IS DISTINCT FROM NEW.naab_code
           OR bull_name IS DISTINCT FROM NEW.bull_name);

    UPDATE project_billing_session_inventory
    SET bull_code = NEW.naab_code,
        bull_name = NEW.bull_name
    WHERE bull_catalog_id = NEW.id
      AND (bull_code IS DISTINCT FROM NEW.naab_code
           OR bull_name IS DISTINCT FROM NEW.bull_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_bull_catalog_changes ON public.bulls_catalog;

CREATE TRIGGER trg_cascade_bull_catalog_changes
  AFTER UPDATE ON public.bulls_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_bull_catalog_changes();

NOTIFY pgrst, 'reload schema';
