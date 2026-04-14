create table if not exists regions (
  id   serial primary key,
  name text not null unique
);

insert into regions (name) values
  ('Карелия'),
  ('Санкт-Петербург'),
  ('Ленинградская область'),
  ('Москва'),
  ('Подмосковье'),
  ('Краснодарский край'),
  ('Крым'),
  ('Алтай'),
  ('Байкал'),
  ('Урал')
on conflict (name) do nothing;

-- Allow anyone to read regions (needed for the public form)
alter table regions enable row level security;

create policy "regions are public"
  on regions for select
  using (true);
