# GSC Health Check Skill

Weekly Google Search Console health probe for Hermes profiles. Autodiscovers all brands from the org's brands gateway API — as new brands are added to the catalog, they're automatically included with no env var changes required. Ranks findings per brand by revenue impact and creates a Paperclip issue with a cross-brand roll-up.

## Prerequisites

1. A Google Cloud service account with **Search Console API (read-only)** scope, added to each brand's GSC property
2. A brands gateway API endpoint that returns brand/region configs (see below)
3. Hermes running with `paperclip_create_issue` available (`PAPERCLIP_API_KEY` + `PAPERCLIP_DEFAULT_COMPANY_ID`)

## Brands Gateway API

The skill discovers GSC properties by calling your org's brands gateway. The endpoint must return a JSON array matching this shape:

```json
[
  {
    "slug": "brand-slug",
    "name": "Brand Name",
    "regions": [
      {
        "region": "AU",
        "domain": "example.com.au",
        "services": {
          "gsc": {
            "configured": true,
            "site_url": "sc-domain:example.com.au"
          }
        }
      }
    ]
  }
]
```

The skill filters to regions where `services.gsc.configured === true` and uses `site_url` as the GSC property identifier.

**Haverford Dev API:** the endpoint is `GET /api/internal/brands` with `x-internal-client-id` and `x-internal-client-secret` headers.

**Orgs without a brands gateway:** set `GSC_PROPERTY_URLS` as a comma-separated fallback instead of `GSC_BRANDS_API_URL`.

## Setup

### 1. Encode the service account

```bash
base64 -i service-account.json | tr -d '\n'
# Copy output — this is your GSC_SERVICE_ACCOUNT_JSON value
```

### 2. Add the service account to each brand's GSC property

In [Google Search Console](https://search.google.com/search-console) for each property:
Settings → Users and permissions → Add user → Reader

### 3. Set env vars on the deployment

Add to the org's `.env` (not `.env.example` — never commit credentials):

```env
# Brands gateway (multi-brand mode)
GSC_BRANDS_API_URL=https://your-api.example.com/api/internal/brands
GSC_BRANDS_CLIENT_ID=your-internal-client-id
GSC_BRANDS_CLIENT_SECRET=your-internal-client-secret

# GSC service account
GSC_SERVICE_ACCOUNT_JSON=<base64-encoded JSON>

# Issue creation threshold
GSC_ISSUE_THRESHOLD=1
```

Redeploy so Hermes picks up the new vars.

### 4. Register the cron job

```bash
hermes cron create "0 9 * * 1" "Weekly GSC health check" \
  --skill gsc-health-check \
  --profile default \
  --deliver slack
```

### 5. Verify before the first scheduled run

```bash
hermes cron list                 # note the job_id
hermes cron run <job_id>         # trigger immediately
```

Check `/data/agent-stack/reports/gsc/` for per-brand reports and the roll-up.

## Reports

Each run writes:
- `/data/agent-stack/reports/gsc/<brand-slug>-<region>-YYYY-MM-DD.md` — per-brand findings
- `/data/agent-stack/reports/gsc/roll-up-YYYY-MM-DD.md` — cross-brand summary table + top 10 findings

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Error report: `GSC_SERVICE_ACCOUNT_JSON missing` | Env var not set | Redeploy after setting the var |
| Brands gateway returns 401 | Wrong client ID or secret | Check `GSC_BRANDS_CLIENT_ID` / `GSC_BRANDS_CLIENT_SECRET` |
| Brand appears in gateway but has no GSC data | Service account not added to that property | Add it in Search Console → Settings → Users |
| `paperclip_create_issue` fails | `PAPERCLIP_API_KEY` or `PAPERCLIP_DEFAULT_COMPANY_ID` missing | Set both and redeploy |
| New brand missing from report | Brand not yet in the catalog or `gsc` not set in its region config | Add `gsc: { siteUrl: '...' }` to the brand catalog and redeploy the Dev API |
