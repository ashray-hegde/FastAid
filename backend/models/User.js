const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fullName: { type: String },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  age: { type: Number },
  mobileNumber: { type: String },
  secondaryMobileNumber: { type: String },
  role: { type: String, enum: ["user", "provider", "admin"], default: "user" },
  walletBalance: { type: Number, default: 0 },
  rating: { type: Number, default: 4.5 },
  completedBookings: { type: Number, default: 0 },
  experienceYears: { type: Number, default: 0 },
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
  lastLocationUpdate: { type: Date, default: null },
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
