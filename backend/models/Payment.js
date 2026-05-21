const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  amount: { type: Number, required: true, default: 0 },
  method: { type: String, enum: ["upi", "qr", "card", "cod", "wallet"], default: "cod" },
  transactionId: String,
  status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
  failureReason: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Payment", paymentSchema);
