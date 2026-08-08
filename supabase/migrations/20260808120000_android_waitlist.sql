-- Android beta waitlist collected from the ChartsGPT marketing site.
-- Public (anon) clients may only INSERT; reading the list requires the
-- service role key, so signups can never be scraped from the website.

create extension if not exists citext;

create table if not exists public.android_waitlist (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  locale text,
  source text not null default 'website',
  referrer text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint android_waitlist_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint android_waitlist_email_length check (char_length(email) <= 254),
  constraint android_waitlist_locale_length check (locale is null or char_length(locale) <= 16),
  constraint android_waitlist_source_length check (char_length(source) <= 32),
  constraint android_waitlist_referrer_length check (referrer is null or char_length(referrer) <= 512),
  constraint android_waitlist_user_agent_length check (user_agent is null or char_length(user_agent) <= 512)
);

create unique index if not exists android_waitlist_email_key
  on public.android_waitlist (email);

create index if not exists android_waitlist_created_at_idx
  on public.android_waitlist (created_at desc);

alter table public.android_waitlist enable row level security;

drop policy if exists "anon can join waitlist" on public.android_waitlist;
create policy "anon can join waitlist"
  on public.android_waitlist
  for insert
  to anon, authenticated
  with check (source = 'website');

-- No select/update/delete policies on purpose: only the service role can read.
revoke all on public.android_waitlist from anon, authenticated;
grant insert (email, locale, source, referrer, user_agent) on public.android_waitlist to anon, authenticated;
