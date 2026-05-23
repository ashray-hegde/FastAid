const { test, expect } = require('@playwright/test');

const TEST_PHONE = process.env.TEST_PHONE || '+911234567890';
const BACKEND_API = process.env.BACKEND_URL || 'http://localhost:5000';

test.describe('Auth Lockout', () => {
  test('API: repeated request-otp triggers 429', async ({ request }) => {
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const resp = await request.post(`${BACKEND_API}/api/auth/request-otp`, { data: { mobileNumber: TEST_PHONE } });
      if (resp.status() === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBeTruthy();
  });

  test('UI: repeated Request OTP clicks eventually receive 429 from server', async ({ page }) => {
    await page.goto('/login');

    // fill phone
    const phoneInput = page.locator('input[placeholder="+91 98765 43210"]');
    await phoneInput.fill(TEST_PHONE);

    const requestButton = page.getByRole('button', { name: /Request OTP/i });

    let saw429 = false;
    for (let i = 0; i < 10; i++) {
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/auth/request-otp') && r.request().method() === 'POST'),
        requestButton.click()
      ]);

      if (response.status() === 429) {
        saw429 = true;
        break;
      }

      // small delay between clicks
      await page.waitForTimeout(300);
    }

    expect(saw429).toBeTruthy();
  });
});
