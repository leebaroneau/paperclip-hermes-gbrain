# Tech Debt Tracker — template-agent

Living register of known debt. Each row is a candidate for a future plan in `active/`.
Update on every PR that knowingly defers cleanup.

| ID | Item | Severity | Owner | Opened | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

## Severity scale

- **S1** — blocks correctness or security. Fix immediately.
- **S2** — measurable production risk. Schedule within the current iteration.
- **S3** — friction / future-proofing. Schedule when adjacent code is touched.
- **S4** — note only. Acknowledged, no action required yet.

## Adding an entry

```
| <id> | <one-line description with link to file:line or PR> | S<n> | @<github-handle> | YYYY-MM-DD | <context> |
```
