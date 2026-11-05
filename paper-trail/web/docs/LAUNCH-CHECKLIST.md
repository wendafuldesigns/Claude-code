# Launch checklist

Work down it in order. Nothing here is optional for the stage it's under.

## Before you invite friends (a small beta)

- [ ] The first live test from `DEPLOY.md` passes: sign up, scan, save, reload, account screen, sign out.
- [ ] You tried it on a real iPhone **and** a real Android phone, in the browser and added to the home screen. Check that **Take a photo** opens the camera.
- [ ] The sign-in email arrives in the inbox (not spam) for Gmail, Apple Mail, and Outlook addresses.
- [ ] The sign-in code works for a brand new person **and** for someone who signed up before. (They get two different emails. Both templates must show the code.)
- [ ] You scanned 10 or more of your own messy real receipts and bills. Note which ones Claude misread. Try Sonnet if there are many.
- [ ] You set a monthly spend limit at Anthropic.
- [ ] Your Supabase project is on the Pro plan, so it doesn't pause and it keeps backups.
- [ ] Only the anon (public) key is in the Netlify settings. The service_role key and the Anthropic key are nowhere in this repository.
- [ ] You know how to give a tester a plan or more trial days (the SQL in `DEPLOY.md`).
- [ ] The beta group knows it's a beta and how to reach you.

## Before you charge money

- [ ] Payments are built and tested with Stripe's test mode (next stage). A paid person's plan turns on, a late payment is handled, and a cancel keeps their papers readable.
- [ ] The Terms and Privacy pages are reviewed by someone qualified, the [brackets] are filled in, and the draft boxes are gone. They match what the app really does.
- [ ] The refund rule is decided and written in the Terms.
- [ ] You decided on the scan cap per month and the trial length (the numbers are in the database settings).
- [ ] A **delete my account** button exists, or you've decided to handle deletions by email and the Privacy page says so.
- [ ] You tried "Save all my papers as a spreadsheet" with a lot of papers.
- [ ] The production build runs: `node app/build.mjs --production` (it refuses while the legal pages are drafts).
- [ ] Sales tax is sorted out for digital subscriptions where you sell. Ask your accountant, or use a seller that handles it for you.

## Before you tell the world

- [ ] You decided about a CAPTCHA on sign-in. Without one, someone could make lots of throwaway accounts. The scan caps limit the cost, but not the clutter. Adding one needs a small code change.
- [ ] Backups are on, and you've tried getting a copy of your database back.
- [ ] You've checked the Supabase and Anthropic usage pages after a week of real use, and the numbers match `COSTS.md`.
- [ ] You know where you'd look if scans start failing: Supabase, Edge Functions, scan, Logs.
- [ ] A way to say "we're having a problem" to customers (a note on your site or an email).
- [ ] Someone other than you tried to sign up with no help.
- [ ] You wrote a plain answer for "is my stuff safe?" and it's true. It's covered by the privacy rules in the database (60 automated checks), the private photo storage, and the secure connection. It's also honest about the fact that you, as the owner of the database, could technically see the data.
- [ ] Support: where do questions go, and who answers.
- [ ] A habit for keeping things up to date. Supabase and the libraries get updates.

## Later

- Family sharing: invite a spouse or parent into one household. The database is ready for it.
- Reading PDFs, not just photos.
- A bigger plan for people who hit the monthly cap.
- A yearly price.
