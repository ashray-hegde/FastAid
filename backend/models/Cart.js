const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  serviceName: String,
  quantity: { type: Number, default: 1, min: 1 },
  price: { type: Number, default: 0 },
  savedForLater: { type: Boolean, default: false }
});

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  items: [cartItemSchema],
  couponCode: String,
  discount: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  serviceCharge: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Cart", cartSchema);
