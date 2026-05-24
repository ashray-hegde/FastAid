const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  amount: { type: Number, required: true, default: 0 },
  currency: { type: String, default: "INR" },
  paymentMethod: { type: String },
  method: { type: String, enum: ["upi", "qr", "bank", "card", "manual", "cod", "wallet"], default: "cod" },
  razorpay_order_id: { type: String },
  razorpay_payment_id: { type: String },
  transactionId: String,
  transactionType: { type: String, enum: ["booking", "topup", "refund"], default: "booking" },
  status: { type: String, enum: ["pending", "paid", "failed", "created", "refunded"], default: "pending" },
  requiresApproval: { type: Boolean, default: false },
  failureReason: String,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  adminReview: {
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
    reviewedAt: Date
  },
  createdAt: { type: Date, default: Date.now }
});

paymentSchema.index({ userId: 1 });
paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
