# MIZAD (مِزاد): multi-vendor live auction platform

Next.js 14 + TypeScript + Supabase (Postgres, Auth, Realtime, Storage) + Stripe. UI uses the approved prototype's exact tokens (plain CSS in `src/app/globals.css`, IBM Plex Sans Arabic, RTL default, AR/EN switch).

> Status: this code was written but **not executed or tested** (no build environment was available). Expect small fixes on first `npm run build`. Test everything with Stripe **test mode** before any real money.

## 1. Setup (about 30 minutes)
1. **Supabase**: create a project. SQL Editor: run `supabase/migrations/001_schema.sql`, then `002_functions.sql`.
2. **Auth**: enable *Email* (turn off "Confirm email" while testing) and *Phone* with an SMS provider (Twilio, MessageBird, etc.). Bidder OTP will not work until a provider is configured.
3. **Env**: copy `.env.example` to `.env.local` and fill it in. `SUPABASE_SERVICE_ROLE_KEY` is server-only; never expose it.
4. **Stripe** (test mode): add the keys. Create a webhook to `https://YOUR-DOMAIN/api/webhooks/stripe` with events `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`, `payment_intent.canceled`, `checkout.session.completed`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. `npm install && npm run dev`. Deploy: push to GitHub, import in Vercel, add the same env vars (`vercel.json` runs the billing cron hourly; set `CRON_SECRET`).
6. **Make yourself Super Admin**: sign up at `/login`, then in SQL: `update profiles set role='super_admin' where id='<your auth user id>';` and open `/admin`. Set the activation fee there (default 0).

Flow to test: vendor signs up, creates page, pays activation, adds items, shares `/<slug>/live`; bidder opens it, verifies phone, requests to join; vendor approves and opens an item.

## 2. Database design (summary)
Every vendor-owned row carries `vendor_id`; RLS lets a vendor read only their own rows, and `owns_vendor()` backs every policy. Browsers get **column-level write grants only** (they can never write prices, winners, fees, ledgers). All money-moving logic is in `002_functions.sql` and callable only by the server (`service_role`).
Tables: profiles, vendors, bidders (per vendor, private), auctions, auction_items, bids, support_contributions, payments, refunds, invoices, item_service_fees, vendor_activation_payments, notifications, audit_logs, webhook_events, platform_settings. Money = integer **fils** (AED 2.50 = 250). Fees are admin-editable in `platform_settings`, no code change.

## 3. Bidding engine
`place_bid()` locks the item row (`FOR UPDATE`), then checks: vendor active, item live, bidder approved + phone verified, not already leading, amount ≥ minimum and on the increment grid (500, 600, 700…). Idempotency key prevents duplicates; `unique(item_id, amount)` is a second guard. Every accepted bid is timestamped and kept forever.

## 4. Bid Support (the core feature)
Example: Abdullah leads at 1,000 → Hamad proposes 1,200 and chooses "ادعم المزايد الحالي".
1. Browser sends only `newPriceFils`. `request_support()` computes the contribution (1,200 − 1,000 = 200), rejects self-support and invalid steps, and records `price_before / price_after / beneficiary` in `support_contributions` (status `pending_payment`, expires after `support_hold_minutes`).
2. Server creates a Stripe PaymentIntent with `capture_method=manual` (an **authorization hold**, not a charge).
3. After Hamad confirms the card, Stripe's **verified webhook** fires; `confirm_support()` re-checks that the item is still live, still at the same price and the same beneficiary. If so: contribution → `authorized`, price → 1,200, **Abdullah stays the winner**; Hamad appears only in the ledger. If anything changed, the hold is released and nobody is charged.
4. Multiple supporters work the same way (Saeed +100 → 1,300). Invariant: `current_price = base_bid + sum(authorized contributions)`.
5. **Outbid**: if another bidder takes the lead, all authorized holds are marked `released` and cancelled at Stripe. Contributions are never moved to another bidder.
6. **Close**: winner's authorized holds are captured (`captured`); unpaid ones cancelled. A captured contribution can be refunded by admin (`refund_contribution`), with a `refunds` row and full audit trail.
A queue column `payments.provider_sync` makes Stripe calls retryable (cron retries failures).

## 5. Fees
- **Activation**: one time (`vendor_activation_payments.vendor_id` is unique), paid through Stripe Checkout, vendor becomes active only after the verified webhook.
- **Per item**: `item_service_fees.item_id` is unique, inserted on the first valid bid. 1 or 100 bids = one AED 2.50 fee; unsold items with a bid still count; no bids = no fee.
- **Invoices**: manual, per session, or threshold (admin setting), CSV statement download, Stripe Checkout payment.

## 6. Limitations and things you MUST review before real money
- **Seller settlement is not automated.** The platform collects support contributions; paying vendors needs Stripe Connect or manual payout. Confirm what Stripe supports for your UAE account and use case (marketplace/escrow-like flows, auction categories, authorization-hold duration, minimum AED charge ≈ AED 2, which is why `increment_fils >= 200`).
- **UAE regulation**: collecting funds from one person for another's purchase may need a licence or a regulated payment partner. Get a lawyer's opinion first.
- Winning bidders' own payment to the seller (their base bid) is outside the platform in this MVP; only support contributions go through the gateway.
- Card holds expire after a few days; very long auctions need a re-authorization design.
- Rate limiting in `src/lib/rate.ts` is per-instance memory; use Redis/Upstash in production.
- Not built: bidder history page, notification UI (rows are written to `notifications`), vendor logo upload, PDF invoices (CSV only), automated tests, security audit.
- TikTok: no API used. Vendors share their `/<slug>/live` link during the live.
