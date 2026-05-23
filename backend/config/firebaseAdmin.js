const admin = require("firebase-admin");

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const firebaseServiceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

let firebaseServiceAccount = null;
if (firebaseServiceAccountBase64) {
  try {
    firebaseServiceAccount = JSON.parse(Buffer.from(firebaseServiceAccountBase64, "base64").toString("utf8"));
  } catch (err) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT_BASE64", err.message);
  }
}

const firebaseCredential = firebaseServiceAccount
  || (firebaseProjectId && firebaseClientEmail && firebasePrivateKey
    ? {
        projectId: firebaseProjectId,
        clientEmail: firebaseClientEmail,
        privateKey: firebasePrivateKey
      }
    : null);

let firebaseAdminApp = null;

if (firebaseCredential) {
  try {
    firebaseAdminApp = admin.apps.length
      ? admin.apps[0]
      : admin.initializeApp({ credential: admin.credential.cert(firebaseCredential) });
  } catch (err) {
    console.error("Failed to initialize Firebase Admin", err.message);
  }
}

const isFirebaseConfigured = Boolean(firebaseAdminApp);

const verifyFirebaseToken = async (idToken) => {
  if (!firebaseAdminApp) {
    throw new Error("Firebase admin is not configured");
  }
  return await admin.auth().verifyIdToken(idToken);
};

module.exports = { isFirebaseConfigured, verifyFirebaseToken };
