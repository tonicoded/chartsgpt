# gotem

Standalone website for gotem — catch what’s really out there.

## Run locally

```bash
npm run dev
```

Then open [http://localhost:4179](http://localhost:4179).

## Android waitlist

`POST /api/android-waitlist` validates submissions and stores normalized email
addresses through the private Supabase `join_android_waitlist` RPC. The table
itself is not readable through the public API. `SUPABASE_URL` and
`SUPABASE_ANON_KEY` may be set in the deployment environment; production
defaults point at the gotem Supabase project.
