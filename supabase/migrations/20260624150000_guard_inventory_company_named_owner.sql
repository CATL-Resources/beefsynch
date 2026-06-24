-- Prevent the customer/company ownership collision that hid company stock from
-- saleable inventory (e.g. a "Select Sires" CUSTOMER record identical to the
-- Select Sires COMPANY). Company-owned semen must be recorded as company-owned
-- inventory, never assigned to a customer that merely shares a company's name.
--
-- This fires only on writes, and only when customer_id points to a customer
-- whose name matches an inventory-owning company. No such customer exists after
-- the bogus "Select Sires" / "CATL Resources, PC" customer records were renamed,
-- so this is purely forward-looking protection.

create or replace function public.guard_inventory_company_named_owner()
returns trigger
language plpgsql
as $$
begin
  if NEW.customer_id is not null and exists (
    select 1
    from customers c
    join semen_companies sc
      on lower(trim(sc.name)) = lower(trim(c.name))
     and sc.organization_id = c.organization_id
     and sc.can_own_inventory = true
    where c.id = NEW.customer_id
  ) then
    raise exception
      'Inventory owner "%" matches a semen company, not a customer. Record company stock as company-owned inventory (e.g. Select or CATL) instead of assigning it to a customer.',
      (select name from customers where id = NEW.customer_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_inventory_company_named_owner on public.tank_inventory;
create trigger trg_guard_inventory_company_named_owner
before insert or update of customer_id on public.tank_inventory
for each row execute function public.guard_inventory_company_named_owner();
