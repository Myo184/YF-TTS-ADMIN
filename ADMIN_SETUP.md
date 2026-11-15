# Admin account setup

1. Run `setup.sql` in Supabase SQL Editor.
2. Create/sign in to the account you want to use as the admin in Supabase Authentication.
3. Run this SQL, replacing the email with the exact admin email:

```sql
insert into public.admin_users (user_id, email)
select id, email
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do update set email = excluded.email;
```

If the insert returns `INSERT 0 0`, confirm that the user exists in Authentication > Users and that the email is correct.

Do not expose the Supabase service-role key in the website or mobile app.
