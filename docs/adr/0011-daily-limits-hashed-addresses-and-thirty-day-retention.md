# ADR-0011: Daily limits on a hashed address, a site-wide cap, and thirty days of retention

Date: 2026-10-06
Status: accepted

## Context
Every check is two calls to Anthropic's API, paid for with my key. The site has no accounts, so
there is nobody to bill and nobody to ban. Left open, one script can spend the month's credit in
an afternoon, and the first sign of it would be the invoice.

The same site also stores what people paste, so the link to a result can be shared. A donor
pasting a campaign is not signing up for anything, and the site should keep as little about them
as it can while still keeping the limits and the link working.

## Decision
A check is charged before any model is called, against two buckets in one transaction: the
visitor's bucket for the UTC day, capped by `ANALYSES_PER_IP_PER_DAY` (5 by default), and the
site's bucket for the day, capped by `ANALYSES_PER_DAY` (100 by default). Each bucket is one
conditional upsert in `analysis_quota`, so the count and the cap are checked in the same
statement and two concurrent requests cannot both take the last check. The visitor is charged
first and the site second, and a refusal on the site cap rolls the visitor's charge back, so
someone turned away because the site is spent loses nothing. The code is `consumeAnalysis` in
`src/lib/quota.ts`.

The visitor is identified by their IP address, and the address is never stored. What is stored
is an HMAC-SHA256 of it keyed with `IP_HASH_SECRET`. A plain hash would not be enough, because the
IPv4 space is small enough to enumerate, and a hash anyone can recompute is the address with one
extra step. The bucket key carries the day, and rows older than yesterday are deleted, so a
visitor's hash lives for two days at most.

The limits fail closed. With no `IP_HASH_SECRET` set, or no address on the request, the site runs
no checks and says why. A deployment that cannot keep its limits does not run without them.

Pasted campaigns and their files are kept for `RETENTION_DAYS` (30 by default) so a shared link
keeps working, and are then deleted. The purge runs inside every check, on the write path, so
retention does not depend on a scheduled job that may not run. An expired link says the campaign
was not found or was deleted after the retention period. Result pages ask search engines not to
index them, and nothing on the site links to one.

The address comes from the first entry of `x-forwarded-for`, falling back to `x-real-ip`.

## Alternatives considered
- **No limits, and watch the bill.** Rejected. Watching the bill finds the problem after it has
  happened, and the cost lands on me whatever the cause.
- **A captcha or a sign-in.** Rejected for now. Both add friction for every honest donor to slow
  down the rare dishonest one, and a sign-in means storing an identity, which is the opposite of
  what the privacy notice promises.
- **Store the raw address and delete it later.** Rejected. A deletion that is supposed to happen
  is weaker than a value that was never written, and the hash does everything the limit needs.
- **A plain SHA-256 of the address.** Rejected, because it can be reversed by hashing every IPv4
  address, which is a few minutes of work.
- **Rate limiting in the edge firewall instead of the database.** Not rejected on merit. It would
  work, but it ties the limits to one host, and the database is already the one place every
  request passes through.

## Consequences
Easy: the model spend has a hard daily ceiling that holds under concurrency, and the privacy
notice on the front page describes properties the code actually has.

Hard, and accepted for a demo: `x-forwarded-for` can be set by the client. Vercel's
documentation says it overwrites the header and does not forward external values, "to prevent IP
spoofing" (https://vercel.com/docs/headers/request-headers), but a self-hosted copy behind a proxy
that passes the header through lets anyone send a fresh value with each request and get a fresh
personal limit. The site-wide cap is the
backstop that makes this survivable: whatever the per-visitor limit lets through, the day still
ends at `ANALYSES_PER_DAY`.

That backstop has its own cost. One person who can vary their address, or who simply has many,
can use up the whole day's cap and lock every other donor out until midnight UTC. For a demo with
no revenue and one owner, a day of refusals is a better failure than an open-ended bill, and I
have chosen it knowingly. A production version would need something stronger than an address to
tell visitors apart.

A check is charged before the model runs, so a check that fails partway still counts against both
limits. Refunding it would mean trusting the failure path to run, which is the path most likely
not to.
