# BeefSynch — App Profile

| Field | Value |
|---|---|
| Supabase Project | `ktelduvdymplytoihtht` |
| GitHub Repo | `chandyolson/beefsynch` |
| Hosting | Vercel (auto-deploy from GitHub `main`) |
| Domain | beefsynch.com |
| Supabase Org | `cf2dcf1e-2658-4f39-a494-b03f3bd69e76` |
| Notion Audit DB | `66ac8c64-56aa-40a7-b903-b1dd088f707e` |
| Critical Paths | Orders → Pack → Billing → Invoice PDF |
| Money Paths | Billing semen (`units_billable × unit_price`), billing products (`units_billed × unit_price`), invoice totals, `invoicing_company_id` routing |
| Edge Functions | See `EDGE_FUNCTIONS.md` |
| Current Users | Chandy, Tim (internal) |
| Deploy Method | Claude Code → GitHub → Vercel auto-deploy |
| Backup | `full-export` Edge Function, nightly cron 07:00 UTC, emails ZIP to `office@catlresources.com` |
| Health Check | `health-check` Edge Function, weekly Monday 07:00 UTC |
| Function Monitor | `function-monitor` Edge Function, every 6 hours |
| Error Monitoring | Sentry (DSN pending — install only, awaiting `VITE_SENTRY_DSN` from Chandy) |
| Pre-Deploy Script | `npm run pre-deploy` (`scripts/pre-deploy.sh`) |
| Post-Deploy Checklist | `scripts/post-deploy-checklist.md` |
