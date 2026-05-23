# Smoke auth test

This script exercises the OTP auth flow locally by:

- POST /api/auth/request-otp
- polls MongoDB `OtpCode` collection for the OTP
- POST /api/auth/verify-otp with the OTP (creates user)

Usage:

```
# From backend/ folder
# Ensure MONGO_URI is set (e.g. export MONGO_URI="mongodb://localhost:27017/fastaid")
# Optional: set API_URL if your server isn't at http://localhost:5000
npm run smoke-auth -- +911234567890 "Smoke User" smoke@example.com SmokePass123
```

Notes:
- This script requires access to the MongoDB used by the backend so it can read the OTP entry.
- Intended for local/dev smoke checks only.
