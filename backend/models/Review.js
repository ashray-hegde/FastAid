const mongoose = require("mongoose");

module.exports = mongoose.model("Review", new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  tipAmount: { type: Number, default: 0 },
  feedback: String,
  createdAt: { type: Date, default: Date.now }
}));
