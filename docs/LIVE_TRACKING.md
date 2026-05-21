# Live Tracking and Address IDs

This short README explains the recent changes:

- Saved Addresses
  - Addresses now include a stable `id` field (UUID) stored in `User.savedAddresses[].id`.
  - Backend endpoints use address IDs instead of array indices.
    - `POST /auth/addresses` — add new address (server assigns `id`).
    - `GET /auth/addresses` — list addresses.
    - `PUT /auth/addresses/:id` — update address by `id`.
    - `DELETE /auth/addresses/:id` — delete address by `id`.

- Front-end
  - `frontend/src/pages/ProfilePage.js` updated to use address IDs for edit/delete.
  - New address form flow uses `editingAddressId` (null | "new" | `id`).

- Live Map (Leaflet)
  - `frontend/src/components/LiveMap.js` replaced Google Maps with Leaflet (`react-leaflet`).
  - Map uses OpenStreetMap tiles; provider marker is updated in real-time via sockets.
  - The map joins booking room when `bookingId` prop is passed (emits `join-booking` with JWT).

- Backend Socket
  - `backend/socket/socketHandler.js` emits both `latitude`/`longitude` and `lat`/`lng` keys for compatibility.

- Environment
  - A placeholder `frontend/.env.local` has been added to store `REACT_APP_GOOGLE_MAPS_API_KEY` if needed by other components. Replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` with your real key.

Notes
- Ensure `react-leaflet` and `leaflet` are installed (already present in `frontend/package.json`).
- Restart frontend dev server after changing `.env.local`.
