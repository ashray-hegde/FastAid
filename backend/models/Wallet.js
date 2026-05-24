const mongoose = require('mongoose');

const WalletTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['topup', 'debit', 'refund'], required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('WalletTransaction', WalletTransactionSchema);