Playwright E2E tests

Requirements:
- Backend running at `http://localhost:5000` (or set `BACKEND_URL`).
- Frontend running at `http://localhost:3000` (or set `FRONTEND_URL`).

API/UI lockout tests:
- `TEST_PHONE` environment variable controls the phone number used by tests (default: +911234567890).

Admin lockout tests:
- Set `ADMIN_TOKEN` in environment to a valid admin JWT (issued by the backend) to run the admin lockout spec.

Run tests:

```bash
cd frontend
npm install
npx playwright install
npm run test:e2e
```

To run admin tests (requires `ADMIN_TOKEN`):

```bash
export ADMIN_TOKEN="<admin_jwt>"; npm run test:e2e
```
