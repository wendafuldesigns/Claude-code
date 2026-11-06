# What it costs to run Paper Trail

These are estimates. I haven't run a real scan against the live service yet, so the per-scan numbers come from published prices and rough sizes. Your first week of real use will give you the true figures. Anthropic's usage page shows them.

## What a scan costs

A scan sends the photo and the reading instructions to Claude and gets a few lines of details back.

Rough size of one scan of one page: about 4,400 tokens in (the photo plus the instructions) and about 800 tokens out.

| Model | Price per million tokens (in / out) | One page | Four pages | 100 one-page scans |
| --- | --- | --- | --- | --- |
| Claude Haiku 5.5 (the setting I picked) | $0.10 / $0.50 | about 0.1 cent | about 0.2 cent | about $0.08 |
| Claude Sonnet 5.5 | $2 / $10 | about 1.7 cents | about 3.5 cents | about $1.70 |
| Claude Opus 5.5 | $4 / $20 | about 3.4 cents | about 7 cents | about $3.40 |

Prices come from Anthropic's published price list as of this writing. They can change.

The service uses Haiku unless you change the `SCAN_MODEL` setting in Supabase. Test a handful of your own messy real receipts. If Haiku misreads too many, try Sonnet. Even Sonnet is only a couple of cents a scan.

## What you pay each month no matter what

| Thing | Cost | Notes |
| --- | --- | --- |
| Supabase | $25 a month (Pro) | Free projects pause after a week with no activity and have no backups. Use Pro before real customers. |
| Netlify | $0 to start | The free plan is plenty for a while. |
| Resend (sign-in emails) | $0 to start | The free plan covers 3,000 emails a month. Past that, a paid plan. |
| Your domain | What you already pay | |

## What you pay per customer

- **Payments (Stripe):** about 2.9% plus 30 cents for each card charge in the US. Check Stripe's page for the current number.
- **Scans:** the table above. The monthly cap (100 scans by default) stops it from ever running away.
- **Photo storage:** about half a megabyte a paper. The Pro plan includes 100 GB. That's roughly 200,000 papers.

## How the math works out

Take a subscription price P. Your cost per customer each month is about `0.029 × P + 0.30` for Stripe, plus the scan cost.

| Price | Stripe takes | Scans at the 100 cap (Haiku) | What's left per customer | Customers to cover Supabase |
| --- | --- | --- | --- | --- |
| $4 a month | $0.42 | $0.08 | $3.50 | 8 |
| $6 a month | $0.47 | $0.08 | $5.45 | 5 |
| $8 a month | $0.53 | $0.08 | $7.39 | 4 |

The price I'd go with is **$6 a month or $49 a year**. Here's the yearly one worked out the same way:

| Price | Stripe takes | Scans at the 100 cap, all year (Haiku) | What's left per customer | Per month | Customers to cover Supabase |
| --- | --- | --- | --- | --- | --- |
| $49 a year | $1.72 | $0.96 | $46.32 | $3.86 | 7 |

A yearly customer is worth a little less each month than a monthly one, but you get the money up front and pay Stripe's 30 cents once instead of twelve times. The scan cap is the same either way, so a yearly customer can't cost you more.

Prices are your call. These two are where I'd start.

## The safety nets

- Each household can only use 15 scans during the trial and 100 a month after that.
- A free trial needs a confirmed email. Someone making fake accounts gets about 15 scans each, which costs you around a cent.
- You set a monthly spend limit at Anthropic. If everything else failed, that's the ceiling.
- Photos are resized before they're sent, and the service refuses anything larger than a normal photo.
- The service's settings fix the model and the size of the answer. The app can't ask for something pricier.

## What can surprise you

- **A price change.** Anthropic or Supabase can change what they charge. You'll get notice.
- **Heavy users.** The cap protects you. If people hit it often, that's a good sign, and a reason to offer a bigger plan.
- **An outage.** If Anthropic is down, scans fail and people are given their scan back. They can still add papers by hand.
