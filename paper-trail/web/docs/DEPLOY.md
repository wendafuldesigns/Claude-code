# Putting Paper Trail online

This takes about two to three hours the first time. You do it in your browser. No terminal needed.

I can't see your dashboards, so a button may be named a little differently than I say. If something looks different, tell me what you see and I'll sort it out.

## What you're setting up

- **Supabase** holds your customers' accounts, records, and photos, and runs the rules that keep each family's papers private.
- **Anthropic** reads the photos. A small Supabase function sits between the app and Anthropic. It's the only thing that holds your Anthropic key.
- **Netlify** puts the app on the internet at your own address.
- **Resend** sends the sign-in codes by email.

## Where each secret goes

Never paste a key into a chat, a file in this repository, or the app itself. Each one goes in one place.

| Secret | The only place it goes |
| --- | --- |
| Anthropic API key | Supabase, Edge Functions, Secrets, named `ANTHROPIC_API_KEY` |
| Resend API key | Supabase, Authentication, SMTP settings, the password box |
| Supabase database password | Your password manager. You rarely need it. |
| Supabase `service_role` key | Nowhere. Supabase gives it to the function by itself. You never copy it. |
| Supabase anon (public) key | Netlify, site settings, `SUPABASE_ANON_KEY`. This one is meant to be public. |

The build stops if you hand it the wrong kind of Supabase key, so a mix-up can't reach your customers.

## Step 1: Anthropic

1. Make an account at console.anthropic.com and add a payment method.
2. Set a **monthly spend limit** (Settings, Limits). Pick a number you'd be fine losing, like $25 to start. This is your safety net if anything ever goes wrong.
3. Create an API key (Settings, API Keys). Name it `paper-trail`. It's shown once, so put it straight into your password manager. You'll paste it into Supabase in step 5.

## Step 2: Supabase

1. Make an account at supabase.com and create a project. Name it `paper-trail`. Choose the region closest to most of your customers. Make a strong database password and save it in your password manager.
2. Wait for it to finish setting up (a couple of minutes).
3. Open **Project Settings, API**. Copy two things somewhere handy:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **anon / publishable key**. Not the service_role key.

## Step 3: The database

1. In Supabase, open **SQL Editor** and make a new query.
2. Open `paper-trail/web/supabase/migrations/0001_init.sql` from this repository, copy all of it, and paste it in.
3. Press **Run**. It should say it succeeded.
4. Check: **Table Editor** should show `households`, `household_members`, `records`, and `scan_usage`. **Storage** should show a private bucket called `scans`.

This one file sets up the tables, the privacy rules, the scan counter, and the photo rules. It has 60 automated checks behind it.

## Step 4: Sign-in emails

People sign in with a 6-digit code sent by email, so email has to work.

1. **Make a Resend account** (resend.com), add your domain, and add the DNS records it shows you at wherever your domain lives. This proves the emails really come from you, so they land in the inbox and not spam. Create an API key.
2. In Supabase, open **Authentication, SMTP Settings**, switch on custom SMTP, and fill in what Resend tells you (host `smtp.resend.com`, port `465`, username `resend`, and the Resend API key as the password). Set the sender to something like `hello@yourdomain.com` with the name `Paper Trail`.
   Supabase's built-in email is only for trying things out. It sends a handful of emails an hour, so it won't work for real customers.
3. Open **Authentication, Providers** and make sure **Email** is on and **Confirm email** is on.
4. Open **Authentication, Email Templates**. Change **both** "Confirm signup" and "Magic Link" so the message shows the code. For each, set the subject to `Your Paper Trail code is {{ .Token }}` and use a body like this:

   ```html
   <p>Your Paper Trail code is:</p>
   <h2 style="letter-spacing:4px">{{ .Token }}</h2>
   <p>Type it into the app to sign in. It works for an hour. If you didn't ask for it, you can ignore this email.</p>
   ```

   Both are needed: a new person gets "Confirm signup" the first time, and everyone after that gets "Magic Link".
5. Open **Authentication, URL Configuration** and set the **Site URL** to the address your app will live at, such as `https://papertrail.yourdomain.com`.

## Step 5: The scan service

This is the small function that reads the photos.

1. In Supabase, open **Edge Functions** and choose to **deploy a new function via the editor**. Name it exactly `scan`.
2. Open `paper-trail/web/supabase/scan-function-single-file.ts` from this repository, copy all of it, and paste it into the editor, replacing what's there. Deploy.
3. Open the function's settings and turn **off** "Enforce JWT verification". The function checks the person's sign-in itself (it's safer with the newer kinds of keys).
4. Open **Edge Functions, Secrets** and add these two:
   - `ANTHROPIC_API_KEY` is the key from step 1.
   - `ALLOWED_ORIGINS` is the address of your app, such as `https://papertrail.yourdomain.com`. Use the exact address people will visit.

You don't set `SUPABASE_URL` or the service key. Supabase fills those in for the function.

If you'd rather use the command line later, the same function is in `supabase/functions/scan` and `supabase/config.toml` already says the right thing.

## Step 6: Put the app online (Netlify)

1. Make an account at netlify.com and choose **Add new site, Import an existing project**. Connect GitHub and pick this repository (`Claude-code`). Choose the branch you want to publish.
2. Netlify reads `paper-trail/web/netlify.toml` and fills in the build settings for you. Leave them.
3. Before the first build, open **Site configuration, Environment variables** and add three. These are public, so it's fine:
   - `SUPABASE_URL` is the Project URL from step 2.
   - `SUPABASE_ANON_KEY` is the anon / publishable key from step 2.
   - `SUPPORT_EMAIL` is where people can reach you.
4. Deploy. When it finishes you get an address like `something.netlify.app`.
5. Add your own address: **Domain management, Add a custom domain**, such as `papertrail.yourdomain.com`. Netlify shows the one DNS record to add at your domain provider. HTTPS turns on by itself.
6. Go back to step 4.5 and step 5.4 and make sure the Site URL and `ALLOWED_ORIGINS` are your final address.

The Terms and Privacy pages are drafts. While testing, that's fine. Before real customers, they need a proper read, and the production build (`node app/build.mjs --production`) won't run until they're finished. See the launch checklist.

## Step 7: Your first test

Do this on your phone, in Safari or Chrome, and then add the app to your home screen.

1. Open your address. You should see the sign-in screen.
2. Enter your email. A 6-digit code arrives. Type it in. You land in the app with "Free trial: 14 days left" at the top.
3. Take a photo of a real receipt. Check that the details come out right.
4. Save it. Close the app and open it again. The paper should still be there, with its photo.
5. Open Supabase, **Table Editor, records**. You should see one row. Open **Storage, scans** and you should see the photo.
6. Open the account screen in the app (the little person icon). Check the numbers. Try "Save all my papers as a spreadsheet".
7. Sign out and back in.

Tell me anything that didn't work, with what you saw on screen. The first live run is where we find the surprises.

## Looking after testers

Run these in the Supabase SQL Editor. Swap in the person's email.

Give someone a paid plan for a month (no payment yet):

```sql
update public.households set plan_status = 'active', current_period_end = now() + interval '30 days'
where id = (select m.household_id from public.household_members m join auth.users u on u.id = m.user_id where u.email = 'tester@example.com' limit 1);
```

Give someone more trial time:

```sql
update public.households set trial_ends_at = now() + interval '14 days'
where id = (select m.household_id from public.household_members m join auth.users u on u.id = m.user_id where u.email = 'tester@example.com' limit 1);
```

See who has used how many scans:

```sql
select u.email, s.month, s.count from public.scan_usage s
join public.household_members m on m.household_id = s.household_id
join auth.users u on u.id = m.user_id
order by s.month desc, s.count desc;
```

## Deleting someone's account

Do the photos first, because they live in Storage and not in the database.

1. In the SQL Editor, find their household: `select m.household_id from public.household_members m join auth.users u on u.id = m.user_id where u.email = 'person@example.com';`
2. In **Storage, scans**, open the folder named with that id and delete everything in it.
3. In **Authentication, Users**, delete the person. Their household, records, and scan counts go with them.

A button for people to do this themselves is on the launch checklist.

## What isn't built yet

- Payments. The trial and the plan states all work. Taking money (Stripe) is the next stage.
- Inviting family into one household. The database is built for it. The invite screens aren't.
- A "delete my account" button. For now, people email you and you follow the steps above.
- A CAPTCHA on sign-in. Decide on this before a big public launch.
