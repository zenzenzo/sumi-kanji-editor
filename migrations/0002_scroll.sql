create table if not exists practice_scroll (
  id         serial primary key,
  user_id    text not null,
  kanji      text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kanji)
);
create index if not exists practice_scroll_user_id_idx on practice_scroll (user_id);
