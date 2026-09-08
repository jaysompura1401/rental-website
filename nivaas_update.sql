-- =====================================================================
-- NIVAAS DATABASE — UPDATE SCRIPT
-- Supabase SQL Editor mein paste karo aur Run karo
-- Safe to run multiple times (idempotent)
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1: nivaas_notifications table (naya table add karo)
-- ---------------------------------------------------------------------
create table if not exists nivaas_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references nivaas_users(id) on delete cascade,
  type        varchar(60) not null,
  title       varchar(255) not null,
  body        text,
  link        varchar(500),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notif_user   on nivaas_notifications (user_id);
create index if not exists idx_notif_unread on nivaas_notifications (user_id, is_read);

-- RLS enable + allow all policy
alter table nivaas_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'nivaas_notifications'
    and policyname  = 'allow all - nivaas_notifications'
  ) then
    execute $policy$
      create policy "allow all - nivaas_notifications"
      on nivaas_notifications for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- STEP 2: property_images — cover sync trigger
-- Jab bhi image add/update/delete ho, cover_image_url auto-update ho
-- ---------------------------------------------------------------------
create or replace function sync_property_cover()
returns trigger as $$
begin
  update nivaas_properties
  set cover_image_url = (
    select url
    from nivaas_property_images
    where property_id = coalesce(new.property_id, old.property_id)
    order by (is_cover::int) desc, sort_order asc
    limit 1
  )
  where id = coalesce(new.property_id, old.property_id);
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_sync_cover_insert on nivaas_property_images;
drop trigger if exists trg_sync_cover_update on nivaas_property_images;
drop trigger if exists trg_sync_cover_delete on nivaas_property_images;

create trigger trg_sync_cover_insert
  after insert on nivaas_property_images
  for each row execute function sync_property_cover();

create trigger trg_sync_cover_update
  after update on nivaas_property_images
  for each row execute function sync_property_cover();

create trigger trg_sync_cover_delete
  after delete on nivaas_property_images
  for each row execute function sync_property_cover();

-- ---------------------------------------------------------------------
-- STEP 3: nivaas_property_images — sort_order column ensure karo
-- (already exists in base schema, just adding comment for clarity)
-- ---------------------------------------------------------------------
comment on column nivaas_property_images.sort_order
  is 'display_order: 0 = first/cover image, higher = later in gallery';

-- ---------------------------------------------------------------------
-- STEP 4: nivaas_property_visits — "accepted" status support
-- status check mein "accepted" alias add karo (confirmed = accepted)
-- Already "confirmed" exists — no change needed.
-- Just verify visit_type column has video_call
-- ---------------------------------------------------------------------
-- (visit_type check already includes 'video_call' in base schema)

-- ---------------------------------------------------------------------
-- STEP 5: Fix identity sequences (cities, amenities ke baad)
-- ---------------------------------------------------------------------
select setval(
  pg_get_serial_sequence('nivaas_cities', 'id'),
  (select coalesce(max(id), 1) from nivaas_cities)
);

select setval(
  pg_get_serial_sequence('nivaas_amenities', 'id'),
  (select coalesce(max(id), 1) from nivaas_amenities)
);

-- ---------------------------------------------------------------------
-- STEP 6: Existing cover_image_url sync karo current images se
-- (ek baar run karo — existing properties ke liye cover fix karta hai)
-- ---------------------------------------------------------------------
update nivaas_properties p
set cover_image_url = (
  select url
  from nivaas_property_images pi
  where pi.property_id = p.id
  order by (pi.is_cover::int) desc, pi.sort_order asc
  limit 1
)
where exists (
  select 1 from nivaas_property_images pi
  where pi.property_id = p.id
);

-- ---------------------------------------------------------------------
-- DONE!
-- Ab aapka database production-ready hai.
-- Notifications, cover sync, aur index sab add ho gaye.
-- =====================================================================
select 'Nivaas DB update complete ✅' as status;
