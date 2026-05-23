const { test, expect } = require('@playwright/test');

const BACKEND_API = process.env.BACKEND_URL || 'http://localhost:5000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

test.describe('Admin Lockout endpoints', () => {
  test('List and revoke lockouts using admin token', async ({ request }) => {
    test.skip(!ADMIN_TOKEN, 'ADMIN_TOKEN not set in environment');

    const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };

    // fetch lockouts
    const res = await request.get(`${BACKEND_API}/api/auth/admin/lockouts`, { headers });
    expect(res.ok()).toBeTruthy();
    const lockouts = await res.json();

    // if there are no lockouts, create a dummy failed request to ensure at least one exists is out of scope here
    if (!lockouts || lockouts.length === 0) {
      test.skip(true, 'No lockouts to revoke');
      return;
    }

    const lock = lockouts[0];
    const revoke = await request.post(`${BACKEND_API}/api/auth/admin/lockouts/${lock._id}/unlock`, { headers });
    expect(revoke.ok()).toBeTruthy();
    const body = await revoke.json();
    expect(body.message).toBe('Lockout revoked');
  });
});
