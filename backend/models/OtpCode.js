const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  mobileNumber: { type: String, required: true, index: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  // tracking fields for rate-limiting and abuse prevention
  requestCount: { type: Number, default: 0 },
  lastRequestAt: { type: Date },
  failedVerifyCount: { type: Number, default: 0 }
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OtpCode", otpSchema);
