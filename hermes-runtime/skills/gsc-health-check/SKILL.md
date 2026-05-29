---
name: gsc-health-check
description: Weekly Google Search Console health probe. On first run, interactively asks the operator for the brands gateway URL and credentials, saves them, and optionally customises which brands to include. On subsequent runs, loads saved config and runs fully automatically. Ranks findings by revenue impact and creates a Paperclip issue when actionable problems exist.
triggers:
  - "GSC"
  - "Google Search Console"
  - "search console"
  - "indexing errors"
  - "coverage errors"
  - "site health check"
  - "gsc setup"
---

# GSC Health Check

Run this skill on a weekly cron schedule, or invoke it manually with `/gsc setup` to configure.

On first run (no saved config), the skill enters interactive setup and asks the operator for the brands gateway URL and GSC credentials. On all subsequent runs it loads the saved config and runs automatically.

## Config File

Saved to `/data/agent-stack/config/gsc-health-check.json`. The skill reads and writes this file. It is never committed to the template — it lives only in the org's persistent data volume.

```json
{
  "brands_api_url": "https://your-api.example.com/api/internal/brands",
  "brands_client_id": "...",
  "brands_client_secret": "...",
  "gsc_service_account_json_b64": "...",
  "issue_threshold": 1,
  "brand_overrides": {
    "brand-slug": {
      "enabled": true,
      "notify_channel": "slack:#brand-alerts"
    }
  }
}
```

## Run Steps

### Step 1: Load or create config

Check whether `/data/agent-stack/config/gsc-health-check.json` exists.

**If the config file does not exist → enter interactive setup (Step 2).**

If it exists, load it and skip to Step 3.

### Step 2: Interactive setup (first run only)

Ask the operator the following questions in order. Wait for each answer before proceeding.

1. **Brands gateway URL**
   > "What is the URL of your brands gateway API endpoint? This is the endpoint that returns your brand registry — for example `https://your-api.example.com/api/internal/brands`."

2. **Gateway credentials**
   > "What are the internal client ID and secret for the brands gateway? I'll store these securely in the data volume config file — they will not be committed to the template."

3. **GSC service account**
   > "Please paste your Google Search Console service account JSON (base64-encoded). If you have the raw JSON file, run `base64 -i service-account.json | tr -d '\n'` to encode it first."

4. **Issue creation threshold**
   > "How many findings should trigger a Paperclip issue? Enter 0 to always create one, or a number like 3 to only create issues when findings are significant. Default is 1."

5. **Brand overrides (optional)**
   > "Would you like to customise any brands — for example, disable a specific brand from the check, or route its alerts to a different Slack channel? If yes, tell me which brands and what settings. Otherwise say 'no' to use defaults for all brands."

After collecting all answers, write the config to `/data/agent-stack/config/gsc-health-check.json` and confirm:
> "Config saved. I'll now run the first health check across all your brands."

Then continue to Step 3.

### Step 3: Discover brands from the gateway

Call `GET <brands_api_url>` with headers:
```
x-internal-client-id: <brands_client_id>
x-internal-client-secret: <brands_client_secret>
```

Extract all brand/region pairs where `services.gsc.configured === true`. Apply any `brand_overrides` from config — skip brands with `enabled: false`.

Each entry provides:
- `slug` — brand identifier
- `name` — display name
- `region.region` — region code
- `region.domain` — public domain
- `region.services.gsc.site_url` — GSC property URL (e.g. `https://www.example.com/` or `sc-domain:example.com`)

**Fallback — no brands gateway:** if `brands_api_url` is not set in config, check for `GSC_PROPERTY_URLS` env var as a comma-separated list. Treat each as a single-brand property with no slug/name metadata.

### Step 4: Fetch GSC data per brand

Decode `gsc_service_account_json_b64` from base64 and write to a temp file. Use for all API calls; delete at end of run.

For each brand/region, call the Google Search Console APIs:

- **Index Coverage API** — pages with status `Excluded`, `Error`, or `Valid with warnings`. Limit 50.
- **Search Analytics API** — clicks, impressions, CTR, position for last 7 days vs prior 7 days. Group by page.
- **Core Web Vitals (CrUX)** — flag pages with `SLOW` LCP, FID, or CLS.

### Step 5: Rank findings per brand by revenue impact

Apply the 100m framework sequencing — technical errors first because they suppress rankings that conversion and content depend on:

| Priority | Category | Reason |
|---|---|---|
| 1 | Indexing errors | Active ranking suppression |
| 2 | Core Web Vitals failures | Ranking signal + conversion damage |
| 3 | Traffic drops >15% week-on-week | Revenue signal |
| 4 | High impressions, CTR <2% | Quick-win title/meta fixes |
| 5 | `Valid with warnings` | Structural debt |

Cap each brand at 10 findings. Note how many were omitted if more exist.

### Step 6: Write per-brand reports

```
/data/agent-stack/reports/gsc/<brand-slug>-<region>-YYYY-MM-DD.md
```

Include: summary sentence, findings tables for all 5 priority levels, property checked, data window.

### Step 7: Write cross-brand roll-up report

```
/data/agent-stack/reports/gsc/roll-up-YYYY-MM-DD.md
```

Include: brand summary table (one row per brand/region with counts per priority), top 10 cross-brand findings ranked by impact, brands checked count.

### Step 8: Create Paperclip issue if findings exceed threshold

If total findings >= `issue_threshold`:

Call `paperclip_create_issue`:
- **Title:** `Task: GSC health check — <date> — <N> findings across <M> brands`
- **Body:** Top 5 cross-brand findings with brand, URL, category, recommended fix, expected impact. Link to roll-up report.
- **Label:** `type:task`

Honour per-brand `notify_channel` overrides when delivering the report response.

### Step 9: Clean up

Delete the temp credentials file. Confirm deletion.

## Re-running Setup

If the operator wants to update the config (new brands gateway, rotated credentials, change brand overrides), they can say:

> "Run gsc setup" or "Update my GSC config"

The skill will ask the setup questions again and overwrite the existing config file.

## What This Skill Does Not Do

- Does not make changes to any sites (read-only).
- Does not submit URLs for re-indexing.
- Does not store credentials outside `/data/agent-stack/config/gsc-health-check.json` and the run-scoped temp file.
- Does not commit any org-specific data to the template.

## Cron Setup

Register weekly once setup is complete:

```bash
hermes cron create "0 9 * * 1" "Weekly GSC health check" \
  --skill gsc-health-check \
  --profile default \
  --deliver slack
```

Trigger immediately after setup to verify:

```bash
hermes cron run <job_id>
```
