const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { passport, isGoogleAuthConfigured } = require("../config/passport");
const { verifyFirebaseToken, isFirebaseConfigured } = require("../config/firebaseAdmin");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const multer = require("multer");
const User = require("../models/User");
const Provider = require("../models/Provider");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const OtpCode = require("../models/OtpCode");
const RefreshToken = require("../models/RefreshToken");
const { verifyToken, signToken } = require("../utils/verifyToken");
const { randomUUID, createHash } = require("crypto");
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
const rateLimit = require('express-rate-limit');
const Lockout = require('../models/Lockout');

// Optional Redis-backed store for distributed rate-limits
let RedisStore = null;
let RedisClient = null;
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_URI;
if (REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    RedisClient = new IORedis(REDIS_URL);
    try {
      RedisStore = require('rate-limit-redis');
    } catch (e) {
      // rate-limit-redis not installed or failed to load
      RedisStore = null;
    }
  } catch (e) {
    RedisClient = null;
    RedisStore = null;
  }
}

// Rate limiters
const buildLimiter = (opts) => {
  const base = {
    windowMs: opts.windowMs || 15 * 60 * 1000,
    max: opts.max || 6,
    standardHeaders: true,
    legacyHeaders: false,
    handler: opts.handler || ((req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' }))
  };

  if (RedisStore && RedisClient) {
    try {
      return rateLimit(Object.assign({}, base, { store: new RedisStore({ sendCommand: (...args) => RedisClient.call(...args) }) }));
    } catch (e) {
      // fallback to memory store
      return rateLimit(base);
    }
  }

  return rateLimit(base);
};

const otpRequestLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 6,
  handler: async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await Lockout.create({ key: ip, type: 'ip', reason: 'rate_limit', expiresAt });
    } catch (e) {
      // ignore
    }
    return res.status(429).json({ error: 'Too many OTP requests from this IP, please try again later.' });
  }
});

const otpVerifyLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  handler: async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await Lockout.create({ key: ip, type: 'ip', reason: 'verify_rate_limit', expiresAt });
    } catch (e) {}
    return res.status(429).json({ error: 'Too many attempts, please wait before retrying.' });
  }
});

const isTwilioValid =
  typeof TWILIO_ACCOUNT_SID === "string" &&
  TWILIO_ACCOUNT_SID.startsWith("AC") &&
  typeof TWILIO_AUTH_TOKEN === "string" &&
  TWILIO_AUTH_TOKEN.length > 0 &&
  typeof TWILIO_FROM_NUMBER === "string" &&
  TWILIO_FROM_NUMBER.length > 0;

const otpSenderEnabled = isTwilioValid;
let twilioClient = null;
if (otpSenderEnabled) {
  const Twilio = require("twilio");
  twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

const providerDocsDestination = path.join(__dirname, "..", "uploads", "provider-docs");
fs.mkdirSync(providerDocsDestination, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, providerDocsDestination),
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.fieldname}-${file.originalname}`.replace(/\s+/g, "_");
      cb(null, fileName);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const generateTokenPayload = (user) => ({
  id: user._id,
  role: user.role,
  name: user.name,
  profileComplete: user.profileComplete,
  authMethod: user.authMethod,
  isMobileVerified: user.isMobileVerified
});

const calculateProfileComplete = ({ fullName, mobileNumber, age }) => {
  return Boolean(fullName && mobileNumber && age);
};

const normalizePhoneNumber = (value) => {
  if (!value) return "";
  return value.toString().trim().replace(/[^+0-9]/g, "").replace(/^00/, "+");
};

const normalizeEmail = (value) => {
  return value?.toString().trim().toLowerCase();
};

const createRefreshTokenForUser = async (userId) => {
  const rawToken = randomUUID();
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await RefreshToken.create({ userId, tokenHash, expiresAt });
  return rawToken;
};

const buildAuthResponse = async (user) => {
  const token = signToken(generateTokenPayload(user));
  const refreshToken = await createRefreshTokenForUser(user._id);
  return { token, refreshToken, role: user.role, name: user.name, profileComplete: user.profileComplete };
};

const sendOtpMessage = async (mobileNumber, code) => {
  if (otpSenderEnabled && twilioClient) {
    try {
      await twilioClient.messages.create({
        body: `Your FastAid login code is ${code}`,
        from: TWILIO_FROM_NUMBER,
        to: mobileNumber
      });
    } catch (err) {
      console.error("Twilio SMS error", err);
      throw new Error("Unable to send OTP at the moment");
    }
  } else {
    console.log(`OTP for ${mobileNumber} is ${code}`);
  }
};

router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password, role, age, mobileNumber, secondaryMobileNumber, addresses, firebaseToken } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhoneNumber(mobileNumber);

    if (!fullName || !normalizedEmail || !password || !normalizedPhone) {
      return res.status(400).json({ error: "Full name, email, password and mobile number are required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    if (!firebaseToken || !isFirebaseConfigured) {
      return res.status(400).json({ error: "Mobile verification is required for registration." });
    }

    const decodedFirebase = await verifyFirebaseToken(firebaseToken);
    if (!decodedFirebase.phone_number || normalizePhoneNumber(decodedFirebase.phone_number) !== normalizedPhone) {
      return res.status(400).json({ error: "Phone verification failed for the provided mobile number." });
    }

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }

    if (await User.findOne({ mobileNumber: normalizedPhone })) {
      return res.status(400).json({ error: "This mobile number is already registered." });
    }

    const hash = await bcrypt.hash(password, 12);
    const isComplete = calculateProfileComplete({ fullName, mobileNumber: normalizedPhone, age });

    const userData = {
      name: fullName,
      fullName,
      email: normalizedEmail,
      password: hash,
      role: role || "user",
      authMethod: "password",
      authProviders: ["password", "otp"],
      loginProviders: ["password"],
      profileComplete: isComplete,
      age: age ? Number(age) : undefined,
      mobileNumber: normalizedPhone,
      secondaryMobileNumber: secondaryMobileNumber || undefined,
      isMobileVerified: true,
      phoneVerified: true,
      firebaseUid: decodedFirebase.uid
    };

    if (role === "user" && addresses && Array.isArray(addresses) && addresses.length > 0) {
      userData.savedAddresses = addresses.map((addr) => ({
        id: addr.id || randomUUID(),
        label: addr.label || "Home",
        street: addr.street,
        city: addr.city,
        state: addr.state,
        postalCode: addr.postalCode,
        coordinates: addr.coordinates
      })).slice(0, 10);
    }

    const user = await User.create(userData);

    if (user.role === "provider") {
      await Provider.create({ userId: user._id, documents: {}, verified: false, verificationStatus: "unsubmitted" });
    }

    const authResponse = await buildAuthResponse(user);
    res.status(201).json(authResponse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const identifier = req.body.identifier || req.body.email;
    const password = req.body.password;
    if (!identifier || !password) {
      return res.status(400).json({ error: "Email/mobile and password are required." });
    }

    const normalizedIdentifier = normalizeEmail(identifier);
    const normalizedPhone = normalizePhoneNumber(identifier);

    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { mobileNumber: normalizedPhone }
      ]
    });

    if (!user) return res.status(400).json({ error: "Invalid credentials." });

    const validPassword = await bcrypt.compare(password, user.password || "");
    if (!validPassword) return res.status(400).json({ error: "Invalid credentials." });

    user.lastLoginAt = new Date();
    if (!user.loginProviders.includes("password")) {
      user.loginProviders.push("password");
    }
    await user.save();

    const authResponse = await buildAuthResponse(user);
    res.json(authResponse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/phone-login", async (req, res) => {
  try {
    const { firebaseToken } = req.body;
    if (!firebaseToken) {
      return res.status(400).json({ error: "Firebase token is required for OTP login." });
    }

    const decodedFirebase = await verifyFirebaseToken(firebaseToken);
    if (!decodedFirebase.phone_number) {
      return res.status(400).json({ error: "Invalid phone login token." });
    }

    const normalizedPhone = normalizePhoneNumber(decodedFirebase.phone_number);
    let user = await User.findOne({ mobileNumber: normalizedPhone });

    if (!user) {
      const placeholderEmail = `${normalizedPhone.replace(/\D/g, "")}@otp.fastaid.local`;
      user = await User.create({
        name: normalizedPhone,
        fullName: normalizedPhone,
        email: placeholderEmail,
        authMethod: "otp",
        authProviders: ["otp"],
        loginProviders: ["otp"],
        mobileNumber: normalizedPhone,
        profileComplete: false,
        isMobileVerified: true,
        phoneVerified: true,
        role: "user",
        firebaseUid: decodedFirebase.uid
      });
    }

    user.lastLoginAt = new Date();
    if (!user.loginProviders.includes("otp")) {
      user.loginProviders.push("otp");
    }
    await user.save();

    const authResponse = await buildAuthResponse(user);
    res.json(authResponse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required." });
    }

    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const existingToken = await RefreshToken.findOne({ tokenHash, revoked: false, expiresAt: { $gt: new Date() } });
    if (!existingToken) {
      return res.status(401).json({ error: "Invalid or expired refresh token." });
    }

    const user = await User.findById(existingToken.userId);
    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    existingToken.revoked = true;
    await existingToken.save();

    const authResponse = await buildAuthResponse(user);
    res.json(authResponse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/request-otp", otpRequestLimiter, async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    if (!mobileNumber) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    // check for existing lockouts for this IP or phone
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = new Date();
    const ipLock = await Lockout.findOne({ key: ip, type: 'ip', revoked: false, expiresAt: { $gt: now } });
    if (ipLock) return res.status(429).json({ error: 'Requests from this IP are temporarily blocked.' });

    const normalizedPhone = normalizePhoneNumber(mobileNumber);

    const phoneLock = await Lockout.findOne({ key: normalizedPhone, type: 'phone', revoked: false, expiresAt: { $gt: now } });
    if (phoneLock) return res.status(429).json({ error: 'This phone number is temporarily blocked from requesting OTPs.' });
    // per-phone cooldown: prevent frequent requests
    // (now already defined above when checking lockouts)
    const existing = await OtpCode.findOne({ mobileNumber: normalizedPhone });
    const MIN_SECONDS_BETWEEN = 45; // seconds
    if (existing && existing.lastRequestAt && (now - existing.lastRequestAt) / 1000 < MIN_SECONDS_BETWEEN) {
      return res.status(429).json({ error: `Please wait ${MIN_SECONDS_BETWEEN} seconds between OTP requests.` });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const update = {
      $set: { code, expiresAt, lastRequestAt: now },
      $inc: { requestCount: 1 }
    };

    await OtpCode.findOneAndUpdate({ mobileNumber: normalizedPhone }, update, { upsert: true, new: true });

    await sendOtpMessage(normalizedPhone, code);
    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/verify-otp", otpVerifyLimiter, async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;
    if (!mobileNumber || !otp) {
      return res.status(400).json({ error: "Mobile number and OTP are required" });
    }

    const normalizedPhone = normalizePhoneNumber(mobileNumber);
    const now = new Date();

    // check phone lockouts
    const phoneLock = await Lockout.findOne({ key: normalizedPhone, type: 'phone', revoked: false, expiresAt: { $gt: now } });
    if (phoneLock) return res.status(429).json({ error: 'This phone number is temporarily blocked from verification attempts.' });
    const record = await OtpCode.findOne({ mobileNumber: normalizedPhone });
    if (!record) return res.status(400).json({ error: "Invalid or expired OTP" });

    // block if too many failed attempts recently
    const FAILED_LIMIT = 5;
    if (record.failedVerifyCount >= FAILED_LIMIT && record.lastRequestAt && (new Date() - record.lastRequestAt) < 30 * 60 * 1000) {
      return res.status(429).json({ error: 'Too many failed attempts for this number. Try again later.' });
    }

    if (record.code !== otp || record.expiresAt < new Date()) {
      record.failedVerifyCount = (record.failedVerifyCount || 0) + 1;
      record.lastRequestAt = now;
      await record.save();

      const FAILED_LIMIT = 5;
      if (record.failedVerifyCount >= FAILED_LIMIT) {
        // create persistent lockout for this phone
        try {
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
          await Lockout.create({ key: normalizedPhone, type: 'phone', reason: 'failed_otp_attempts', expiresAt });
        } catch (e) {}
      }

      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // successful verification: remove OTP record
    await OtpCode.deleteOne({ mobileNumber: normalizedPhone });
    let user = await User.findOne({ mobileNumber: normalizedPhone });

    if (!user) {
      // allow optional profile fields during verification to create richer user accounts
      const { fullName, email, password, role } = req.body;
      const placeholderEmail = normalizeEmail(email) || `${normalizedPhone.replace(/\D/g, "")}@otp.fastaid.local`;
      const baseUser = {
        name: fullName || normalizedPhone,
        fullName: fullName || normalizedPhone,
        email: placeholderEmail,
        authMethod: password ? "password" : "otp",
        authProviders: password ? ["otp", "password"] : ["otp"],
        loginProviders: password ? ["password", "otp"] : ["otp"],
        mobileNumber: normalizedPhone,
        profileComplete: Boolean(fullName && password),
        isMobileVerified: true,
        phoneVerified: true,
        role: role || "user"
      };

      if (password) {
        const hash = await bcrypt.hash(password, 12);
        baseUser.password = hash;
      }

      user = await User.create(baseUser);
    } else if (!user.phoneVerified || !user.isMobileVerified) {
      user.isMobileVerified = true;
      user.phoneVerified = true;
      await user.save();
    }

    const authResponse = await buildAuthResponse(user);
    res.json(authResponse);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const ensureGoogleAuthConfigured = (req, res, next) => {
  if (!isGoogleAuthConfigured) {
    return res.status(503).json({ error: "Google OAuth is not configured on this server." });
  }
  next();
};

router.get(
  "/google",
  ensureGoogleAuthConfigured,
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  ensureGoogleAuthConfigured,
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || "http://localhost:3000"}/login`
  }),
  async (req, res) => {
    if (!req.user) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=google_auth_failed`);
    }

    req.user.loginProviders = req.user.loginProviders || [];
    if (!req.user.loginProviders.includes("google")) {
      req.user.loginProviders.push("google");
      await req.user.save();
    }

    const token = signToken(generateTokenPayload(req.user));
    const refreshToken = await createRefreshTokenForUser(req.user._id);
    const redirectUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/oauth-callback?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}`;
    res.redirect(redirectUrl);
  }
);

router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password").lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.role === "provider") {
      const provider = await Provider.findOne({ userId: user._id }).lean();
      user.providerInfo = provider || null;
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { fullName, age, mobileNumber, secondaryMobileNumber, profilePicture, email } = req.body;
    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (age !== undefined) updateData.age = Number(age);
    if (mobileNumber) updateData.mobileNumber = normalizePhoneNumber(mobileNumber);
    if (secondaryMobileNumber) updateData.secondaryMobileNumber = normalizePhoneNumber(secondaryMobileNumber);
    if (profilePicture) updateData.profilePicture = profilePicture;
    if (email) updateData.email = normalizeEmail(email);

    const existingUser = await User.findById(req.user.id);
    if (!existingUser) return res.status(404).json({ error: "User not found" });

    const updated = await User.findByIdAndUpdate(req.user.id, updateData, { new: true }).select("-password");
    res.json({ message: "Profile updated successfully", user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/addresses", verifyToken, async (req, res) => {
  try {
    const { label, street, city, state, postalCode, coordinates } = req.body;
    if (!street || !city || !state || !postalCode) {
      return res.status(400).json({ error: "Address details are required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const newAddress = {
      id: randomUUID(),
      label: label || "Home",
      street,
      city,
      state,
      postalCode,
      coordinates: coordinates || { lat: 0, lng: 0 },
      createdAt: new Date()
    };

    if (!user.savedAddresses) user.savedAddresses = [];
    user.savedAddresses.push(newAddress);
    user.savedAddresses = user.savedAddresses.slice(-10);

    await user.save();
    res.status(201).json({ message: "Address saved successfully", address: newAddress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/addresses/:id", verifyToken, async (req, res) => {
  try {
    const { label, street, city, state, postalCode, coordinates } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const address = user.savedAddresses?.find((addr) => addr.id === req.params.id);
    if (!address) return res.status(404).json({ error: "Address not found" });

    if (label) address.label = label;
    if (street) address.street = street;
    if (city) address.city = city;
    if (state) address.state = state;
    if (postalCode) address.postalCode = postalCode;
    if (coordinates) address.coordinates = coordinates;

    await user.save();
    res.json({ message: "Address updated successfully", address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/addresses/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const initialLength = user.savedAddresses?.length || 0;
    user.savedAddresses = (user.savedAddresses || []).filter((addr) => addr.id !== req.params.id);

    if (user.savedAddresses.length === initialLength) {
      return res.status(404).json({ error: "Address not found" });
    }

    await user.save();
    res.json({ message: "Address deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/addresses", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("savedAddresses");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user.savedAddresses || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/complete-profile", verifyToken, async (req, res) => {
  try {
    const { fullName, age, mobileNumber, secondaryMobileNumber, role, email } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (fullName) user.fullName = fullName;
    if (age !== undefined) user.age = Number(age);
    if (mobileNumber) user.mobileNumber = mobileNumber;
    if (secondaryMobileNumber) user.secondaryMobileNumber = secondaryMobileNumber;
    if (email) user.email = email;
    if (role && ["user", "provider"].includes(role)) {
      user.role = role;
    }

    user.profileComplete = calculateProfileComplete({ fullName: user.fullName || user.name, mobileNumber: user.mobileNumber, age: user.age });
    if (user.mobileNumber) user.phoneVerified = true;

    await user.save();

    if (user.role === "provider") {
      const provider = await Provider.findOne({ userId: user._id });
      if (!provider) {
        await Provider.create({ userId: user._id, documents: {}, verified: false, verificationStatus: "unsubmitted" });
      }
    }

    const token = signToken(generateTokenPayload(user));
    res.json({ message: "Profile completed", token, profileComplete: user.profileComplete, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/provider-status", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "provider") {
      return res.status(403).json({ error: "Provider access required" });
    }

    const provider = await Provider.findOne({ userId: req.user.id }).lean();
    if (!provider) {
      return res.status(404).json({ error: "Provider metadata not found" });
    }

    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/update-location", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "provider") {
      return res.status(403).json({ error: "Provider access required" });
    }

    const { latitude, longitude, address, city, state, postalCode } = req.body;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ error: "Latitude and longitude are required" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        location: {
          type: "Point",
          coordinates: [longitude, latitude],
          address: address || "",
          city: city || "",
          state: state || "",
          postalCode: postalCode || ""
        },
        lastLocationUpdate: new Date()
      },
      { new: true }
    );

    await Provider.findOneAndUpdate(
      { userId: req.user.id },
      {
        currentLocation: { lat: latitude, lng: longitude },
        lastOnlineAt: new Date()
      }
    );

    res.json({ success: true, location: updatedUser.location, updatedAt: updatedUser.lastLocationUpdate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/provider-stats", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "provider") {
      return res.status(403).json({ error: "Provider access required" });
    }

    const providerId = new mongoose.Types.ObjectId(req.user.id);

    const bookingStats = await Booking.aggregate([
      { $match: { providerId } },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          completedOrders: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          pendingOrders: { $sum: { $cond: [{ $in: ["$status", ["pending", "assigned", "accepted", "on_the_way", "started"]] }, 1, 0] } },
          cancelledOrders: { $sum: { $cond: [{ $in: ["$status", ["cancelled", "rejected"]] }, 1, 0] } },
          totalEarnings: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$servicePrice", 0] } },
          totalTips: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$tip", 0] } },
          highestTip: { $max: { $cond: [{ $eq: ["$status", "completed"] }, "$tip", 0] } }
        }
      }
    ]);

    const todayEarnings = await Booking.aggregate([
      {
        $match: {
          providerId,
          status: "completed",
          updatedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      },
      { $group: { _id: null, total: { $sum: "$servicePrice" } } }
    ]);

    const weeklyEarnings = await Booking.aggregate([
      {
        $match: {
          providerId,
          status: "completed",
          updatedAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 7)).setHours(0, 0, 0, 0) }
        }
      },
      { $group: { _id: null, total: { $sum: "$servicePrice" } } }
    ]);

    const ratingStats = await Review.aggregate([
      { $match: { providerId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          highestRating: { $max: "$rating" }
        }
      }
    ]);

    const totals = bookingStats[0] || {};
    const avgRating = ratingStats[0]?.averageRating || 0;
    const highestRating = ratingStats[0]?.highestRating || 0;
    const today = todayEarnings[0]?.total || 0;
    const weekly = weeklyEarnings[0]?.total || 0;

    res.json({
      totalOrders: totals.totalBookings || 0,
      completedOrders: totals.completedOrders || 0,
      pendingOrders: totals.pendingOrders || 0,
      cancelledOrders: totals.cancelledOrders || 0,
      totalEarnings: totals.totalEarnings || 0,
      todayEarnings: today || 0,
      weeklyEarnings: weekly || 0,
      totalTips: totals.totalTips || 0,
      highestTip: totals.highestTip || 0,
      averageRating: Number(avgRating.toFixed(2)) || 0,
      highestRating: highestRating || 0,
      activeBookings: totals.pendingOrders || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(
  "/provider-documents",
  verifyToken,
  upload.fields([
    { name: "aadhar", maxCount: 1 },
    { name: "pan", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      if (req.user.role !== "provider") {
        return res.status(403).json({ error: "Provider access required" });
      }

      const provider = await Provider.findOne({ userId: req.user.id });
      if (!provider) {
        return res.status(404).json({ error: "Provider record not found" });
      }

      const aadharFile = req.files?.aadhar?.[0];
      const panFile = req.files?.pan?.[0];
      if (!aadharFile || !panFile) {
        return res.status(400).json({ error: "Both Aadhar and PAN documents are required" });
      }

      provider.documents = {
        aadhar: `/uploads/provider-docs/${aadharFile.filename}`,
        pan: `/uploads/provider-docs/${panFile.filename}`,
        uploadedAt: new Date()
      };
      provider.verificationStatus = "pending";
      provider.verified = false;
      provider.verificationReason = undefined;
      await provider.save();

      res.json({ message: "Documents uploaded successfully", provider });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get("/providers/pending", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const providers = await Provider.find({ verificationStatus: { $in: ["unsubmitted", "pending", "rejected"] } }).populate("userId", "name email");
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/verify-provider/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { status, reason } = req.body;
    const updates = {};

    if (status === "approved") {
      updates.verified = true;
      updates.verificationStatus = "approved";
      updates.verificationReason = undefined;
    } else if (status === "rejected") {
      updates.verified = false;
      updates.verificationStatus = "rejected";
      updates.verificationReason = reason || "Verification rejected";
    } else {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const provider = await Provider.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    res.json(provider);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/users", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/providers", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const providers = await Provider.find().populate("userId", "name email");
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list active lockouts
router.get('/admin/lockouts', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const now = new Date();
    const lockouts = await Lockout.find({ expiresAt: { $gt: now } }).sort({ createdAt: -1 }).lean();
    res.json(lockouts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: revoke/unlock a lockout by id
router.post('/admin/lockouts/:id/unlock', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const lock = await Lockout.findById(req.params.id);
    if (!lock) return res.status(404).json({ error: 'Lockout not found' });
    lock.revoked = true;
    await lock.save();
    res.json({ message: 'Lockout revoked', lock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: revoke all active lockouts
router.post('/admin/lockouts/unlock-all', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const now = new Date();
    const result = await Lockout.updateMany({ expiresAt: { $gt: now }, revoked: false }, { $set: { revoked: true } });
    res.json({ message: 'All active lockouts revoked', modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dev-only: mint a short-lived admin token for CI/testing (logs audit entries)
const DevMintLog = require('../models/DevMintLog');
router.post('/dev/mint-admin-token', async (req, res) => {
  try {
    const devSecret = process.env.DEV_ADMIN_SECRET;
    if (!devSecret) return res.status(403).json({ error: 'Dev token minting is disabled on this server.' });
    const { secret, name } = req.body || {};

    const log = new DevMintLog({ ip: req.ip || req.connection?.remoteAddress, userAgent: req.headers['user-agent'] || '', name: name || '' });

    if (!secret || secret !== devSecret) {
      log.success = false;
      // store a hash of provided secret for auditing without keeping the real secret
      try { const createHash = require('crypto').createHash; log.secretHash = createHash('sha256').update(String(secret || '')).digest('hex'); } catch (e) {}
      await log.save();
      return res.status(401).json({ error: 'Invalid dev secret' });
    }

    const id = randomUUID();
    const payload = { id, role: 'admin', name: name || 'Dev Admin', profileComplete: true };
    const token = signToken(payload);
    const refreshToken = await createRefreshTokenForUser(id);

    log.success = true;
    try { const createHash = require('crypto').createHash; log.secretHash = createHash('sha256').update(String(secret)).digest('hex'); } catch (e) {}
    await log.save();

    res.json({ token, refreshToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/users/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    await Provider.findOneAndDelete({ userId: req.params.id });
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
