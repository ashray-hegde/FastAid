const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fullName: { type: String },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  firebaseUid: { type: String, unique: true, sparse: true },
  authMethod: { type: String, enum: ["password", "google", "otp"], default: "password" },
  authProviders: { type: [String], default: ["password"] },
  loginProviders: { type: [String], default: [] },
  profileComplete: { type: Boolean, default: false },
  age: { type: Number },
  mobileNumber: { type: String, unique: true, sparse: true, trim: true },
  secondaryMobileNumber: { type: String },
  isMobileVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  role: { type: String, enum: ["user", "provider", "admin"], default: "user" },
  walletBalance: { type: Number, default: 0 },
  rating: { type: Number, default: 4.5 },
  completedBookings: { type: Number, default: 0 },
  experienceYears: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: null },
  profilePicture: String,
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    },
    address: String,
    city: String,
    state: String,
    postalCode: String
  },
  savedAddresses: [
    {
      id: { type: String, required: true, index: true },
      label: String,
      street: String,
      city: String,
      state: String,
      postalCode: String,
      coordinates: {
        lat: Number,
        lng: Number
      },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  paymentMethods: {
    upiIds: [String],
    qrCodes: [String],
    bankDetails: {
      accountName: String,
      accountNumber: String,
      ifsc: String,
      bankName: String
    }
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
