# YF TTS Studio Admin

Cloudflare Pages-ready React + TypeScript admin dashboard.

## 1. Supabase setup

1. Open your existing Supabase project.
2. Open **SQL Editor**.
3. Run `supabase/setup.sql`.
4. In Supabase Authentication, create the admin account (or use an existing account).
5. In SQL Editor, run the final admin promotion statement shown in `supabase/ADMIN_SETUP.md`, replacing the email with your admin email.

This project uses a dedicated `admin_users` table for authorization. It does **not** trust editable user metadata or a client-side email check.

## 2. Local setup

```bash
npm install
copy .env.example .env
```

Edit `.env` and enter the Supabase Project URL and Publishable key (or legacy anon key). Never put a `service_role` key in this frontend.

```bash
npm run dev
```

## 3. Cloudflare Pages deployment

- Create a Pages project and upload this ZIP's extracted folder, or connect its Git repository.
- Framework preset: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Add environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Deploy.

The `_redirects` file supports SPA routing.

## Included sections

- Dashboard overview (manual refresh; no polling)
- Users (profiles table)
- Slider manager (upload, title, description, destination URL, visibility, ordering)
- VIP placeholder view
- App settings (maintenance message / announcement)
- Admin access protected by `admin_users` table and Supabase RLS

## Notes

- User statistics are read only when the Dashboard or Users page is opened/refreshed. There is no realtime subscription or background polling.
- Slider data is cached in the mobile app only if the mobile app is separately updated to read `app_sliders`; this admin project alone does not change the existing mobile app.
- The admin UI cannot safely grant itself admin rights. Use the SQL promotion procedure in `supabase/ADMIN_SETUP.md`.
- Existing profile table is extended with optional columns using `ADD COLUMN IF NOT EXISTS`. Review the SQL against your live schema before running it on production.
