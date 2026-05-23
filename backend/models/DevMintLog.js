const mongoose = require('mongoose');

const devMintLogSchema = new mongoose.Schema({
  ip: { type: String },
  userAgent: { type: String },
  secretHash: { type: String },
  name: { type: String },
  success: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DevMintLog', devMintLogSchema);
