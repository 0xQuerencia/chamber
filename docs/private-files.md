# Private CA client documents

This module implements authenticated file uploads with R2 quarantine. No file is published, rendered inline or downloadable before a trusted malware scanner marks it clean.

## Deployment prerequisites

1. Create a **private** R2 bucket dedicated to Chamber. Do not configure a public bucket domain.
2. Bind it to the Worker using an `r2_buckets` binding named `FILES` in `wrangler.jsonc` for the intended environment, or an equivalent environment binding. Keep staging and production buckets separate.
3. Deploy a trusted antivirus scanning service (e.g. ClamAV on a dedicated managed server or container). The service must read each pending object through authorized R2 credentials, verify the full file bytes, and return the SHA-256 that was scanned.
4. Configure a strong random Worker secret `FILE_SCAN_SECRET` **only** for the trusted scanner. Never commit or print it.
5. The scanner calls `POST /api/file-scan/callback` with `X-Scanner-Token` and JSON:
   `{"id":"<file-id>","sha256":"<64 hex>","status":"clean"|"infected"|"failed"}`
6. The Worker verifies the secret and expected hash, updates metadata, and makes **clean** files available through authenticated same-origin download URLs. Infected objects are deleted.
7. Verify upload, scan and download workflows in staging with fictional client data before enabling for a pilot.

## Security properties

- Uploads are limited to 15 MB and allow-listed PDF, JPEG, PNG, CSV and XLSX files.
- Original filenames are sanitized. Object keys are generated server-side inside each firm's namespace.
- Staff uploads require an assigned task; privileged users are scoped to their own firm.
- R2 objects are never exposed as publicly accessible URLs.
- Files download only after a clean scan, with `Content-Disposition: attachment`, `nosniff` and `no-store`.
- D1 stores hashes and access metadata; file transfers and downloads are auditable.
- If R2 or the scanner is unavailable, the module fails closed. An uploaded but unscanned file remains quarantined.
- Uploaded files are **not** verified evidence until the staff member performs the requirement verification workflow.

## Work still required before real client data

Provision private R2, deploy/operate the scanner, monitor quarantine failures, define retention and deletion settings, implement per-file access/revocation checks, test large uploads and incident response, add portal OTP and signed expiring upload links, and independently review confidentiality and India-residency requirements.

No R2 bucket, scanner or secret was created by this PR.
