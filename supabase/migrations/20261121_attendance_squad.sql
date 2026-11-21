-- which half of a split session (A / B) the player trained with that day; null = not chosen / session not split
alter table public.attendance add column if not exists squad text check (squad in ('A','B'));
comment on column public.attendance.squad is 'Squad (A/B) the player trained with on that session — chosen when marking attendance';
