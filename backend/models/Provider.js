const mongoose = require("mongoose");

module.exports = mongoose.model("Provider", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  documents: {
    aadhar: String,
    pan: String,
    voter: String
  },
  verified: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  serviceCategories: [String],
  lastOnlineAt: { type: Date, default: Date.now },
  currentLocation: {
    lat: Number,
    lng: Number
  }
}));
