const mongoose = require("mongoose");

const paymentConfigSchema = new mongoose.Schema({
  upiIds: [
    {
      value: String,
      label: String,
      enabled: { type: Boolean, default: true }
    }
  ],
  qrCodes: [
    {
      url: String,
      label: String,
      enabled: { type: Boolean, default: true }
    }
  ],
  bankAccounts: [
    {
      accountName: String,
      accountNumber: String,
      ifsc: String,
      bankName: String,
      enabled: { type: Boolean, default: true }
    }
  ],
  cardSupported: { type: Boolean, default: true },
  codSupported: { type: Boolean, default: true },
  enabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PaymentConfig", paymentConfigSchema);
