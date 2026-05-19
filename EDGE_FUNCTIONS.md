# Edge Functions — BeefSynch

| Slug | Purpose | verify_jwt |
|---|---|---|
| `full-export` | Daily backup. Builds a ZIP of every table (JSONL), auth users, auth identities, and storage buckets. Two modes: `email` when called with the service-role key (cron) — sends ZIP to `office@catlresources.com`. `download` when called with a user JWT (UI button) — owner/admin only. | false |
| `auth-email-hook` | Custom auth email rendering (signup, magic link, etc.) using branded HTML. Hooked into Supabase Auth. | false |
| `bull-chat` | LLM helper for bull questions (chat UI). | true |
| `google-calendar-config` | Returns Google Calendar OAuth config + token exchange. | false |
| `import-bull-catalog` | Bulk catalog import endpoint used by `/admin/import-bulls`. | false |
| `invite-member` | Sends an org-member invite email via Resend (uses `pending_invites`). | true |
| `match-inventory-to-catalog` | Bulk-link `tank_inventory` rows to `bulls_catalog` by code/name match. | false |
| `resend-invite` | Resends an existing pending invite. | true |
| `health-check` | Weekly health check — runs 23 SQL probes (the 20-check data integrity SQL), emails a PASS/FAIL summary. Cron: Mon 07:00 UTC. | false |
| `function-monitor` | Pings every Edge Function every 6 hours, alerts via Resend when one returns 500/timeout. Logs to `edge_function_health_log`. | false |

## Conventions

- Scheduled functions use `verify_jwt: false` with a manual `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` check inside (the platform-level JWT check causes silent 401s for service-role calls).
- Email-sending functions use Resend with `from: BeefSynch <backups@mail.beefsynch.com>` and `to: office@catlresources.com`.
- Cron jobs live in `cron.job` and call the function via `net.http_post` with the service-role key from `vault.decrypted_secrets` (name `service_role_key`).

## Known operational issue

If the `vault.decrypted_secrets.service_role_key` falls out of sync with the Edge Function `SUPABASE_SERVICE_ROLE_KEY` env, all three crons (nightly backup, weekly health check, 6-hour function monitor) start returning 401 silently. Refresh the vault secret to match the current service-role key when this happens.
