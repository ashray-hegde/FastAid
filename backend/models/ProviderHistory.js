const mongoose = require('mongoose');

const providerHistorySchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serviceName: String,
  amount: Number,
  completedAt: { type: Date, default: Date.now },
  rating: { type: Number, min: 1, max: 5 },
  tipGiven: { type: Number, default: 0 }
});

module.exports = mongoose.model('ProviderHistory', providerHistorySchema);
