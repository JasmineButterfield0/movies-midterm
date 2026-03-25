# 🎬 Movie Watchlist

A personal movie tracker web app with cloud sync, user authentication, and per-user data isolation — built with HTML, CSS, vanilla JavaScript, and **Supabase**.

> **Midterm Project — Front-End Web Development**
> **Author: Jasmine Butterfield**

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Add Movies** | Title, genre, comma-separated tags, notes, optional poster image |
| 2 | **Display List** | Cards with poster thumbnail, tags, and notes |
| 3 | **Remove Movies** | × button on each card; Clear All bulk-deletes |
| 4 | **Mark as Watched** | Checkbox toggles watched status with strikethrough |
| 5 | **Cloud Database** | Per-user data in Supabase (PostgreSQL) with Row Level Security |
| 6 | **User Authentication** | Email/password sign-up & sign-in; session persists across page reloads |
| 7 | **User Profile** | Edit display name; upload a profile photo |
| 8 | **Media Uploads** | Poster images and avatars stored in Supabase Storage |
| 9 | **Search** | Full-text search across title, genre, tags, and notes |
| 10 | **Categories & Filtering** | Status tabs (All/Unwatched/Watched) + clickable genre pills |
| 11 | **Security** | Row Level Security ensures users can never access each other's data |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | HTML5 |
| Styling | CSS3 (custom properties, flexbox, animations) |
| Logic | Vanilla JavaScript (ES6+) |
| Auth | Supabase Auth (email/password) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Storage | Supabase Storage (avatars, poster images) |
| Real-time | Supabase Realtime (postgres_changes subscription) |

---

## Project Structure

```
movie-watchlist/
├── index.html   — App markup: auth section, main app shell, profile modal
├── style.css    — All styles
├── script.js    — Supabase init, auth, database CRUD, render logic
├── .gitignore   — Files excluded from version control
└── README.md    — This file
```

---

## Setup Guide

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**, give it a name, set a database password, and choose a region.
3. Wait for the project to finish provisioning (~1 minute).

---

### 2. Create the Database Tables

Open **SQL Editor** (left sidebar) → **New query** and run:

```sql
-- ── Profiles table (one row per user) ────────────────────────────────
create table profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url   text,
  updated_at   timestamptz default now()
);

-- ── Movies table ──────────────────────────────────────────────────────
create table movies (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  title      text not null,
  genre      text,
  tags       text[],
  notes      text,
  poster_url text,
  watched    boolean default false,
  created_at timestamptz default now()
);

-- ── Enable Row Level Security ─────────────────────────────────────────
alter table profiles enable row level security;
alter table movies   enable row level security;

-- ── RLS Policies ─────────────────────────────────────────────────────
create policy "Users manage own profile"
  on profiles for all
  using      (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users manage own movies"
  on movies for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Auto-create profile row on sign-up ───────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

---

### 3. Enable Real-time on the Movies Table

1. Go to **Database → Replication** in the Supabase Dashboard.
2. Find the `movies` table under **Supabase Realtime** and toggle it **on**.

---

### 4. Create Storage Buckets

Go to **Storage** in the sidebar and create two buckets:

| Bucket name | Public |
|-------------|--------|
| `avatars`   | ✅ Yes |
| `posters`   | ✅ Yes |

Then run these Storage security policies in the SQL Editor:

```sql
-- ── Avatars ───────────────────────────────────────────────────────────
create policy "Users upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Avatars are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- ── Posters ───────────────────────────────────────────────────────────
create policy "Users upload their own posters"
  on storage.objects for insert
  with check (bucket_id = 'posters' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Posters are publicly viewable"
  on storage.objects for select
  using (bucket_id = 'posters');
```

---

### 5. Copy Your Credentials

1. Go to **Project Settings → API** in the Supabase Dashboard.
2. Copy the **Project URL** and the **anon / public** key.

---

### 6. Paste Credentials into script.js

Open `script.js` and replace the two placeholder lines near the top:

```js
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Example:
```js
const SUPABASE_URL      = 'https://xyzxyzxyz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

The anon key is safe to include in client-side code — Row Level Security enforces all access control.

---

### 7. (Optional) Disable Email Confirmation for Development

By default Supabase requires users to confirm their email. To skip this while testing:

1. Go to **Authentication → Settings** in the Supabase Dashboard.
2. Under **Email**, toggle off **"Enable email confirmations"**.

Re-enable before going to production.

---

### 8. Open the App

```bash
npx serve .
# or
python3 -m http.server 8080
```

Visit `http://localhost:8080`, create an account, and start adding movies!

---

## Database Schema

```
profiles
  id           uuid  PK → auth.users
  display_name text
  avatar_url   text
  updated_at   timestamptz

movies
  id         uuid  PK
  user_id    uuid  FK → auth.users   (RLS: auth.uid() = user_id)
  title      text
  genre      text
  tags       text[]
  notes      text
  poster_url text
  watched    boolean
  created_at timestamptz
```

Row Level Security ensures no user can read or modify another user's rows.
