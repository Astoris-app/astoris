# Security policy

## Supported versions

Astoris is under active development. Security fixes target the latest revision of
the default branch (`main`). Older revisions do not receive separate security
backports. Keep your installation and its dependencies up to date.

## Report a vulnerability privately

Please use [GitHub's private vulnerability reporting](https://github.com/Astoris-app/astoris/security/advisories/new).
If that is unavailable, contact [info@astoris.org](mailto:info@astoris.org) and ask
for a private reporting channel before sending sensitive material.

Do not disclose an unpatched vulnerability in a public issue or pull request.
Include the affected commit/version, deployment configuration, expected and actual
behaviour, impact, and minimal reproduction steps. Use synthetic data and redact
credentials, personal information and company documents.

Reports are handled on a best-effort basis. We will coordinate investigation and
disclosure privately; this policy does not promise a response deadline.

## Deployment boundaries

- Use HTTPS or a trusted private network and keep administrative access private.
- Treat configured AI providers, MCP servers and external connectors as trusted
  recipients of the information sent to them.
- Run one Astoris application process per data directory. Back up persistent data
  and the master key together. Encryption does not cover every metadata field or
  retained legacy JSON original.
- Add-on subprocess limits are defence in depth, not hostile-code isolation.
  Do not run untrusted add-on code as though it were safely sandboxed.
- Do not treat this release as a hardened, multi-tenant service with per-user RBAC.

See [runtime architecture and limitations](docs/RUNTIME.md) for exact tool policies,
approval behaviour, persistence, backups and process isolation.

Never commit real `.env` files, access keys, runtime databases or production data.
If a credential has been exposed, revoke or rotate it immediately: deleting the
current file does not invalidate copies in Git history, logs or forks.
