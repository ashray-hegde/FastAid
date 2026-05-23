const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  serviceName: { type: String },
  quantity: { type: Number, default: 1, min: 1 },
  servicePrice: { type: Number, default: 0 },
  location: { type: String },
  locationDetails: {
    street: String,
    area: String,
    city: String,
    state: String,
    postalCode: String,
    fullAddress: String
  },
  coordinates: {
    lat: Number,
    lng: Number
  },
  status: {
  type: String,
  enum: [
    "pending",
    "assigned",
    "accepted",
    "rejected",
    "on_the_way",
    "reached",
    "started",
    "completed",
    "cancelled"
  ],
  default: "pending"
},
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "cod"],
    default: "pending"
  },
  paymentMethod: { type: String, enum: ["upi", "qr", "bank", "card", "manual", "cod", "wallet"], default: "cod" },
  transactionId: { type: String, default: null },
  tip: { type: Number, default: 0 },
  tipSuggestion: { type: Number, default: 0 },
  couponCode: { type: String, default: null },
  etaMinutes: { type: Number, default: null },
  rejectedBy: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  ],
  tracking: {
    providerLat: Number,
    providerLng: Number,
    updatedAt: Date
  }
}, { timestamps: true });

// index common queries
bookingSchema.index({ userId: 1 });
bookingSchema.index({ providerId: 1 });
bookingSchema.index({ serviceId: 1 });

// helper virtual to expose id
bookingSchema.virtual("id").get(function () {
  return this._id.toString();
});

bookingSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Booking", bookingSchema);
