const mongoose = require("mongoose");

module.exports = mongoose.model("Service", new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: String,
  rating: { type: Number, default: 4.5 },
  basePrice: { type: Number, default: 499 },
  suggestedPrice: { type: Number, default: 499 },
  durationMinutes: { type: Number, default: 60 },
  imageUrl: String,
  popularityScore: { type: Number, default: 50 },
  createdAt: { type: Date, default: Date.now }
}));
