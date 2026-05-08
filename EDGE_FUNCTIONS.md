# Edge Functions — BeefSynch

| Slug | Purpose | verify_jwt | Last deployed |
|---|---|---|---|
| `full-export` | Daily backup. Builds a ZIP of every table (JSONL), auth users, auth identities, and storage buckets. Two modes: `email` when called with the service-role key (cron) — sends ZIP to `office@catlresources.com`. `download` when called with a user JWT (UI button) — owner/admin only. | false | 2026-04-20 |
| `auth-email-hook` | Custom auth email rendering (signup, magic link, etc.) using branded HTML. Hooked into Supabase Auth. | false | 2026-04-04 |
| `bull-chat` | LLM helper for bull questions (chat UI). | true | 2026-04-04 |
| `google-calendar-config` | Returns Google Calendar OAuth config + token exchange. | false | 2026-04-21 |
| `import-bull-catalog` | Bulk catalog import endpoint used by `/admin/import-bulls`. | false | 2026-04-12 |
| `invite-member` | Sends an org-member invite email via Resend (uses `pending_invites`). | true | 2026-04-04 |
| `match-inventory-to-catalog` | Bulk-link `tank_inventory` rows to `bulls_catalog` by code/name match. | false | 2026-04-14 |
| `resend-invite` | Resends an existing pending invite. | true | 2026-04-04 |
| `health-check` | Weekly health check — runs 20 SQL probes, emails a PASS/FAIL summary to office. Cron: Mon 07:00 UTC. | false | _pending this PR_ |
| `function-monitor` | Pings every Edge Function every 6 hours, alerts via Resend when one returns 500/timeout. Logs to `edge_function_health_log`. | false | _pending this PR_ |

## Conventions

- New scheduled functions use `verify_jwt: false` with a manual `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` check inside (the platform-level JWT check causes silent 401s for service-role calls — that's why `full-export` does it inline).
- Email-sending functions use Resend with `from: BeefSynch <backups@mail.beefsynch.com>` and `to: office@catlresources.com`.
- Cron jobs live in `cron.job` and call the function via `net.http_post` with the service-role key from `app.settings.service_role_key`.
