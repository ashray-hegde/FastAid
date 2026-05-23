# FastAid (Modernized)

This repo contains the FastAid service booking platform.

## Quick start (development)

1. Install backend dependencies and start server:

```bash
cd backend
npm install
npm start
```

2. Install frontend dependencies and start dev server:

```bash
cd frontend
npm install
npm start
```

3. Environment variables

Create a `.env` file in the `backend` folder with the following variables as needed. See `.env.example` for guidance.

- `MONGO_URI` — MongoDB connection string
- `JWT_SECRET` — JWT signing key
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — (optional) enable Twilio SMS for OTP in production
- `FRONTEND_URL` — front-end origin used for OAuth redirects

Optional Firebase OTP flow (if you prefer Firebase phone auth)

- Set `REACT_APP_FIREBASE_API_KEY`, `REACT_APP_FIREBASE_AUTH_DOMAIN`, `REACT_APP_FIREBASE_PROJECT_ID`, `REACT_APP_FIREBASE_APP_ID` in the frontend `.env` if you choose Firebase (the current default flow uses backend SMS/Twilio).

Security note

- Do not commit `.env` files or secrets to source control.

## Notes

- We standardized the frontend OTP flow to call backend `/auth/request-otp` and `/auth/verify-otp` endpoints. The backend will use Twilio when configured, otherwise it logs OTP to server console for local development (avoid using that mode in production).

- To enable production SMS, set Twilio env variables in backend and restart the server.

If you want, I can continue to polish the UI styles, add centered auth page styles, and harden backend registration for password+OTP workflows.
