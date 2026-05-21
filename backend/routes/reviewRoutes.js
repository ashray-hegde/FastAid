const router = require("express").Router();
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const { verifyToken } = require("../utils/verifyToken");

router.post("/", verifyToken, async (req, res) => {
  try {
    const { bookingId, rating, tipAmount, feedback } = req.body;
    const booking = await Booking.findById(bookingId);
    if (!booking || !booking.userId.equals(req.user.id)) {
      return res.status(404).json({ error: "Booking not found or not owned by user" });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({ error: "Can only review completed bookings" });
    }

    const existing = await Review.findOne({ bookingId, userId: req.user.id });
    if (existing) {
      return res.status(400).json({ error: "You have already reviewed this booking" });
    }

    const review = await Review.create({
      bookingId,
      userId: req.user.id,
      providerId: booking.providerId,
      rating,
      tipAmount: tipAmount || 0,
      feedback
    });

    const ProviderHistory = require("../models/ProviderHistory");
    await ProviderHistory.findOneAndUpdate(
      { bookingId },
      { rating, tipGiven: tipAmount || 0 },
      { new: true }
    );

    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/provider/:providerId", async (req, res) => {
  try {
    const reviews = await Review.find({ providerId: req.params.providerId }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/user", verifyToken, async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
