const mongoose = require('mongoose');

const lockoutSchema = new mongoose.Schema({
  key: { type: String, required: true, index: true }, // phone number or ip
  type: { type: String, enum: ['ip', 'phone'], required: true },
  reason: { type: String },
  adminNote: { type: String },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, default: false }
});

lockoutSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Lockout', lockoutSchema);
