export function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const base64Url = parts[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  try {
    const decodedPayload = atob(padded);
    return JSON.parse(decodedPayload);
  } catch (err) {
    console.error("Failed to decode JWT payload", err);
    return null;
  }
}
