-- Allow NULL bull_code on re-inventory insert. The frontend now auto-fills
-- the code from the catalog pick when one is available; for true custom
-- bulls with no NAAB, NULL is the canonical "no code" value (paired with
-- the UI's em-dash display).
CREATE OR REPLACE FUNCTION public.save_reinventory(_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id        uuid := auth.uid();
  v_org_id         uuid := (_input->>'organization_id')::uuid;
  v_tank_id        uuid := (_input->>'tank_id')::uuid;
  v_top_notes      text := NULLIF(_input->>'notes', '');
  v_changes        jsonb := _input->'changes';
  v_change         jsonb;
  v_action         text;
  v_inv_id         uuid;
  v_inv            tank_inventory%ROWTYPE;
  v_expected       int;
  v_new_units      int;
  v_tank_name      text;
  v_updated_count  int := 0;
  v_deleted_count  int := 0;
  v_inserted_count int := 0;
  v_exists         boolean;
  v_canister       text;
  v_sub_canister   text;
  v_bull_cat_id    uuid;
  v_custom_name    text;
  v_bull_code      text;
  v_item_type      text;
  v_customer_id    uuid;
  v_owner_type     text;
  v_owner_cust_id  uuid;
  v_owner_comp_id  uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH: not authenticated'; END IF;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'INVALID: organization_id is required'; END IF;
  IF v_tank_id IS NULL THEN RAISE EXCEPTION 'INVALID: tank_id is required'; END IF;
  IF v_changes IS NULL OR jsonb_array_length(v_changes) = 0 THEN
    RAISE EXCEPTION 'INVALID: at least one change is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = v_user_id AND organization_id = v_org_id AND accepted = true
  ) THEN
    RAISE EXCEPTION 'AUTH: not a member of this organization';
  END IF;

  SELECT COALESCE(tank_name, tank_number, 'Unknown') INTO v_tank_name
  FROM tanks WHERE id = v_tank_id AND organization_id = v_org_id;
  IF v_tank_name IS NULL THEN
    RAISE EXCEPTION 'INVALID: tank % not found in organization', v_tank_id;
  END IF;

  PERFORM set_transaction_context(
    _transaction_type := 'reinventory_adjustment',
    _user_id          := v_user_id,
    _notes            := COALESCE(v_top_notes,
                                   format('Re-inventory save on tank %s', v_tank_name))
  );

  FOR v_change IN SELECT * FROM jsonb_array_elements(v_changes)
  LOOP
    v_action := v_change->>'action';

    IF v_action = 'update' THEN
      v_inv_id    := (v_change->>'inventory_id')::uuid;
      v_expected  := (v_change->>'expected_previous_units')::int;
      v_new_units := (v_change->>'new_units')::int;

      IF v_inv_id IS NULL OR v_expected IS NULL OR v_new_units IS NULL THEN
        RAISE EXCEPTION 'INVALID: update requires inventory_id, expected_previous_units, new_units';
      END IF;
      IF v_new_units < 0 THEN
        RAISE EXCEPTION 'INVALID: new_units must be >= 0 (got % for row %)', v_new_units, v_inv_id;
      END IF;

      SELECT * INTO v_inv FROM tank_inventory WHERE id = v_inv_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'MISSING: inventory row % no longer exists — someone packed or edited it. Reload and retry.', v_inv_id;
      END IF;
      IF v_inv.tank_id <> v_tank_id OR v_inv.organization_id <> v_org_id THEN
        RAISE EXCEPTION 'INVALID: row % is not on tank % in this organization', v_inv_id, v_tank_id;
      END IF;
      IF v_inv.units <> v_expected THEN
        RAISE EXCEPTION 'STALE: row % was at % units when you opened this page but is now % units (another save happened). Reload and retry.',
          v_inv_id, v_expected, v_inv.units;
      END IF;

      IF v_new_units = 0 THEN
        DELETE FROM tank_inventory WHERE id = v_inv_id;
        v_deleted_count := v_deleted_count + 1;
      ELSE
        UPDATE tank_inventory SET units = v_new_units WHERE id = v_inv_id;
        v_updated_count := v_updated_count + 1;
      END IF;

    ELSIF v_action = 'delete' THEN
      v_inv_id   := (v_change->>'inventory_id')::uuid;
      v_expected := (v_change->>'expected_previous_units')::int;

      IF v_inv_id IS NULL OR v_expected IS NULL THEN
        RAISE EXCEPTION 'INVALID: delete requires inventory_id and expected_previous_units';
      END IF;

      SELECT * INTO v_inv FROM tank_inventory WHERE id = v_inv_id FOR UPDATE;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
      IF v_inv.tank_id <> v_tank_id OR v_inv.organization_id <> v_org_id THEN
        RAISE EXCEPTION 'INVALID: row % is not on tank % in this organization', v_inv_id, v_tank_id;
      END IF;
      IF v_inv.units <> v_expected THEN
        RAISE EXCEPTION 'STALE: row % was at % units when you opened this page but is now % units (another save happened). Reload and retry.',
          v_inv_id, v_expected, v_inv.units;
      END IF;

      DELETE FROM tank_inventory WHERE id = v_inv_id;
      v_deleted_count := v_deleted_count + 1;

    ELSIF v_action = 'insert' THEN
      v_canister      := NULLIF(v_change->>'canister', '');
      v_sub_canister  := NULLIF(v_change->>'sub_canister', '');
      v_bull_cat_id   := NULLIF(v_change->>'bull_catalog_id', '')::uuid;
      v_custom_name   := NULLIF(v_change->>'custom_bull_name', '');
      v_bull_code     := NULLIF(v_change->>'bull_code', '');
      v_new_units     := (v_change->>'new_units')::int;
      v_item_type     := COALESCE(NULLIF(v_change->>'item_type', ''), 'semen');
      v_customer_id   := NULLIF(v_change->>'customer_id', '')::uuid;
      v_owner_type    := NULLIF(v_change->>'owner_type', '');
      v_owner_cust_id := NULLIF(v_change->>'owner_customer_id', '')::uuid;
      v_owner_comp_id := NULLIF(v_change->>'owner_company_id', '')::uuid;

      IF v_canister IS NULL THEN
        RAISE EXCEPTION 'INVALID: insert requires canister';
      END IF;
      IF v_new_units IS NULL OR v_new_units <= 0 THEN
        RAISE EXCEPTION 'INVALID: insert requires new_units > 0';
      END IF;
      IF v_bull_cat_id IS NULL AND v_custom_name IS NULL THEN
        RAISE EXCEPTION 'INVALID: insert requires either bull_catalog_id or custom_bull_name';
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM tank_inventory
        WHERE organization_id = v_org_id
          AND tank_id         = v_tank_id
          AND canister        = v_canister
          AND COALESCE(sub_canister, '') = COALESCE(v_sub_canister, '')
          AND COALESCE(bull_catalog_id::text, '') = COALESCE(v_bull_cat_id::text, '')
          AND COALESCE(custom_bull_name, '')     = COALESCE(v_custom_name, '')
          AND customer_id IS NOT DISTINCT FROM v_customer_id
      ) INTO v_exists;
      IF v_exists THEN
        RAISE EXCEPTION 'DUPLICATE: a row already exists on this tank/canister for this bull and owner. Edit the existing row instead of adding a new one.';
      END IF;

      INSERT INTO tank_inventory (
        organization_id, tank_id, canister, sub_canister,
        bull_catalog_id, custom_bull_name, bull_code,
        units, item_type,
        customer_id, owner_type, owner_customer_id, owner_company_id
      ) VALUES (
        v_org_id, v_tank_id, v_canister, v_sub_canister,
        v_bull_cat_id, v_custom_name, v_bull_code,
        v_new_units, v_item_type,
        v_customer_id, v_owner_type, v_owner_cust_id, v_owner_comp_id
      );
      v_inserted_count := v_inserted_count + 1;

    ELSE
      RAISE EXCEPTION 'INVALID: unknown action %. Expected update|delete|insert.', v_action;
    END IF;
  END LOOP;

  PERFORM clear_transaction_context();

  RETURN jsonb_build_object(
    'ok', true,
    'changes_applied', v_updated_count + v_deleted_count + v_inserted_count,
    'updated',  v_updated_count,
    'deleted',  v_deleted_count,
    'inserted', v_inserted_count
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
