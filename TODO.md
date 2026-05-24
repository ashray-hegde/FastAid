# TODO — FastAid wallet/payment modernization (Razorpay-only)

## Step 1 — Backend: make wallet payments transaction-safe + idempotent
- [ ] Update `backend/controllers/paymentController.js`
  - [ ] Enhance `createOrder` to accept `type` (booking|wallet) and when `type === "wallet"` pre-create a `Payment` record with:
    - `transactionType: "topup"`
    - `method: "wallet"`
    - `paymentMethod: "razorpay"`
    - `paymentStatus` equivalent via `status` field (paid/pending/failed/created)
    - store `razorpay_order_id`, `userId`, `amount`
  - [ ] Make `verifyPayment` set:
    - `razorpay_payment_id`, `status="paid"`, `transactionType="topup"` for wallet flows
    - atomic wallet credit + WalletTransaction update using idempotency guard (no double credit on webhook/verify retries)
  - [ ] Emit realtime Socket.IO events after successful wallet credit:
    - `walletUpdated`
    - `paymentSuccess`
  - [ ] Ensure webhook remains synchronized with verify-payment logic (idempotent wallet credit).

## Step 2 — Backend: payment history + model consistency
- [ ] Ensure `Payment` records for wallet top-ups have `userId` and `transactionType="topup"` so frontend history filtering works.
- [ ] Confirm wallet history endpoint `/payment/history` returns the right fields (especially `razorpay_payment_id`, `createdAt`, `status`, `transactionType`).

## Step 3 — Frontend: remove all legacy manual wallet top-up UI
- [ ] Remove manual wallet top-up JSX + logic from `frontend/src/pages/ProfilePage.js`:
  - `paymentMethods.upiIds`, `qrCodes`, `bankAccounts`
  - `uploadWalletProof`, proof upload UI
  - transaction/reference ID input UI
  - “Request Top-up” manual flow
- [ ] Ensure no old conditional JSX remains.

## Step 4 — Frontend: Razorpay-only wallet top-up modal
- [ ] Replace the wallet “Add Money” flow in `frontend/src/pages/UserDashboard.js`
  - Replace disabled “temporarily disabled” button
  - Add `walletAmount` input UI
  - Add prominent “Pay Now”
  - Open Razorpay Checkout directly (same integration approach as booking in `PaymentPage.js`)
  - Call:
    - `POST /payment/create-order` with `{ amount, currency, receipt, notes, type: "wallet" }`
    - `POST /payment/verify-payment` with `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, type: "wallet" }`
  - Add processing overlay + retry + payment.failed handling + duplicate-click prevention
- [ ] Add socket listener cleanup correctness for `walletUpdated`.

## Step 5 — Frontend: realtime wallet refresh
- [ ] In `frontend/src/pages/UserDashboard.js`, refresh wallet balance/history instantly on `walletUpdated`.
- [ ] Ensure listener uses stable handlers and is cleaned up to prevent duplicates.

## Step 6 — Frontend: reuse Razorpay popup component logic cleanly
- [ ] Update `frontend/src/pages/PaymentPage.js` (or create a small shared wallet Razorpay module) so booking and wallet top-up use a consistent Razorpay handler with proper type routing.

## Step 7 — Verification (critical-path)
- [ ] Booking Payment: popup → verification → booking confirmed
- [ ] Wallet Top-up: popup → verification → wallet credit → realtime update
- [ ] Payment Failed: no wallet credit → retry works
- [ ] Confirm no manual payment UI exists anywhere in app.
