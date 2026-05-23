const mongoose = require("mongoose");

module.exports = mongoose.model("Provider", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  documents: {
    aadhar: String,
    pan: String,
    voter: String,
    uploadedAt: Date
  },
  verified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ["unsubmitted", "pending", "approved", "rejected"], default: "unsubmitted" },
  verificationReason: String,
  active: { type: Boolean, default: true },
  serviceCategories: [String],
  lastOnlineAt: { type: Date, default: Date.now },
  currentLocation: {
    lat: Number,
    lng: Number
  }
}));
