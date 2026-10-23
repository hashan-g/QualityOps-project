# Phase 3 Security Notes

These are implementation requirements, not evidence that a feature is already implemented.

- Never store plaintext passwords.
- Never commit real secrets or use hardcoded production secrets.
- Do not store long-lived tokens in browser localStorage/sessionStorage.
- Prefer a maintained password hashing algorithm and a vetted token implementation.
- Enforce roles on the server; UI hiding is not authorization.
- Use generic login errors, rate limiting, input validation, and safe structured error responses.
- If cookie-based authentication is used, configure HttpOnly, SameSite, Secure-in-production, and appropriate CSRF/origin protections.
- Do not log passwords, password hashes, cookies, tokens, or secrets.
- Use parameterized SQL.
- Test expiry, revocation, disabled users, role escalation, and forbidden access.
- Do not automatically create a default admin/password at application startup.
