const express = require("express");

const router = express.Router();

const Booking = require("../models/Booking");

const Service = require("../models/Service");

const Payment = require("../models/Payment");

const { verifyToken } = require("../utils/verifyToken");

// =====================================================
// CREATE BOOKING
// =====================================================

router.post(
  "/book",
  verifyToken,
  async (req, res) => {
    try {
      const {
        serviceId,
        servicePrice,
        tip = 0,
        couponCode = null,
        location,
        coordinates,
        paymentMethod = "cod",
        transactionId = null,
        locationDetails = {}
      } = req.body;

      if (!serviceId || !location || !coordinates || typeof coordinates.lat !== "number" || typeof coordinates.lng !== "number") {
        return res.status(400).json({ error: "Service, location and coordinates are required" });
      }

      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      const finalPrice = Number(servicePrice) > 0 ? Number(servicePrice) : service.basePrice;
      const tipAmount = Number(tip || 0);
      const paymentAmount = finalPrice + tipAmount;

      const booking = await Booking.create({
        userId: req.user.id,
        providerId: null,
        serviceId,
        serviceName: service.name,
        servicePrice: finalPrice,
        quantity: 1,
        location,
        coordinates,
        locationDetails,
        paymentMethod,
        transactionId,
        paymentStatus: paymentMethod === "cod" ? "cod" : "paid",
        status: "pending",
        tip: tipAmount,
        tipSuggestion: tipAmount,
        couponCode: couponCode || undefined
      });

      await Payment.create({
        userId: req.user.id,
        bookingId: booking._id,
        amount: paymentAmount,
        method: paymentMethod,
        transactionId,
        status: paymentMethod === "cod" ? "pending" : "paid"
      });

      await Payment.create({
        userId: req.user.id,
        bookingId: booking._id,
        amount: booking.servicePrice,
        method: paymentMethod,
        transactionId,
        status: paymentMethod === "cod" ? "pending" : "paid"
      });

      const populatedBooking = await Booking.findById(booking._id)
        .populate("userId", "name email")
        .populate("serviceId", "name category");

      const io = req.app.get("io");
      if (io) {
        io.emit("booking-created", { booking: populatedBooking });
      }

      res.status(201).json({ success: true, booking: populatedBooking });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);


// =====================================================
// PROVIDER BOOKINGS
// =====================================================

router.get(
  "/provider-bookings",
  verifyToken,
  async (req, res) => {
    try {
      if (req.user.role !== "provider") {
        return res.status(403).json({ error: "Provider access required" });
      }

      const bookings = await Booking.find({
        $or: [
          { status: "pending", rejectedBy: { $ne: req.user.id } },
          { providerId: req.user.id, status: { $in: ["assigned", "accepted", "on_the_way", "started"] } }
        ]
      })
        .sort({ createdAt: -1 })
        .populate("userId", "name email")
        .populate("providerId", "name email")
        .populate("serviceId", "name category");

      res.json(bookings);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================
// CUSTOMER BOOKINGS
// =====================================================

router.get(
  "/my-bookings",
  verifyToken,
  async (req, res) => {

    try {

      const bookings =
        await Booking.find({

          userId:
            req.user.id

        })

        .sort({
          createdAt: -1
        })

        .populate(
          "serviceId",
          "name category"
        )

        .populate(
          "providerId",
          "name email"
        );

      res.json(bookings);

    } catch (err) {

      console.log(err);

      res.status(500).json({
        error: err.message
      });

    }

  }
);

// =====================================================
// PROVIDER ACCEPT / REJECT
// =====================================================

router.put(
  "/provider-action/:bookingId",
  verifyToken,
  async (req, res) => {
    try {
      if (req.user.role !== "provider") {
        return res.status(403).json({ error: "Provider only" });
      }

      const { action } = req.body;
      const booking = await Booking.findById(req.params.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (action === "accept") {
        if (booking.status === "accepted" && booking.providerId?.toString() !== req.user.id) {
          return res.status(400).json({ error: "Booking already accepted by another provider" });
        }
        if (["rejected", "cancelled", "completed"].includes(booking.status) && booking.providerId?.toString() !== req.user.id) {
          return res.status(400).json({ error: "Booking cannot be accepted" });
        }
        booking.status = "accepted";
        booking.providerId = req.user.id;
      } else if (action === "reject") {
        if (["accepted", "cancelled", "completed"].includes(booking.status) && booking.providerId?.toString() !== req.user.id) {
          return res.status(400).json({ error: "Cannot reject this booking" });
        }
        if (!Array.isArray(booking.rejectedBy)) {
          booking.rejectedBy = [];
        }
        if (!booking.rejectedBy.some((id) => id?.toString() === req.user.id)) {
          booking.rejectedBy.push(req.user.id);
        }
        if (booking.providerId?.toString() === req.user.id) {
          booking.providerId = null;
        }
        if (booking.status === "accepted" || booking.status === "assigned") {
          booking.status = "pending";
        }
      } else {
        return res.status(400).json({ error: "Invalid action" });
      }

      await booking.save();
      const io = req.app.get("io");
      if (io) {
        io.emit("booking-update", {
          bookingId: booking._id,
          status: booking.status,
          providerId: booking.providerId,
          rejectedBy: booking.rejectedBy
        });
      }

      res.json({ success: true, booking });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);

      // =====================================================
      // PROVIDER COMPLETE WORK
      // =====================================================

      router.put(
        "/complete/:bookingId",
        verifyToken,
        async (req, res) => {
          try {
            if (req.user.role !== "provider") {
              return res.status(403).json({ error: "Provider only" });
            }

            const booking = await Booking.findById(req.params.bookingId);
            if (!booking) {
              return res.status(404).json({ error: "Booking not found" });
            }

            if (booking.providerId?.toString() !== req.user.id) {
              return res.status(403).json({ error: "Not assigned to this provider" });
            }

            // compute predicted tip using the ML tip model if available
            const { execFile } = require("child_process");
            const path = require("path");
            const Review = require("../models/Review");
            const ProviderHistory = require("../models/ProviderHistory");

            const stats = await Review.aggregate([
              { $match: { providerId: booking.providerId } },
              { $group: { _id: "$providerId", avgRating: { $avg: "$rating" }, avgTip: { $avg: "$tipAmount" } } }
            ]);

            const avgRating = stats?.[0]?.avgRating || 4.2;
            const pythonPath = process.env.PYTHON_PATH || "python";
            const filePath = path.join(__dirname, "..", "ml", "tip_model.py");
            const prediction = await new Promise((resolve) => {
              const input = {
                baseAmount: Number(booking.servicePrice) || 0,
                serviceRating: Number(avgRating) || 4.2,
                paymentMethod: booking.paymentMethod || "card",
                urgencyScore: 5
              };
              const child = execFile(pythonPath, [filePath], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                if (error || !stdout) {
                  return resolve({ recommendTip: Math.round(booking.servicePrice * 0.1) });
                }
                try {
                  return resolve(JSON.parse(stdout.trim()));
                } catch (e) {
                  return resolve({ recommendTip: Math.round(booking.servicePrice * 0.1) });
                }
              });
              child.stdin.write(JSON.stringify(input));
              child.stdin.end();
            });

            const predictedTip = Number(prediction?.recommendTip) || Math.round(booking.servicePrice * 0.1);
            booking.status = "completed";
            booking.tipSuggestion = predictedTip;
            await booking.save();

            // create provider history entry
            await ProviderHistory.create({
              providerId: req.user.id,
              bookingId: booking._id,
              userId: booking.userId,
              serviceName: booking.serviceName,
              amount: booking.servicePrice,
              completedAt: new Date()
            });

            const io = req.app.get("io");
            if (io) {
              io.emit("booking-update", { bookingId: booking._id, status: booking.status });
              io.emit("booking-completed", { bookingId: booking._id, userId: booking.userId, providerId: booking.providerId, predictedTip });
            }

            res.json({ success: true, booking, predictedTip });
          } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
          }
        }
      );

      // =====================================================
      // PROVIDER HISTORY
      // =====================================================

      router.get(
        "/provider-history",
        verifyToken,
        async (req, res) => {
          try {
            if (req.user.role !== "provider") return res.status(403).json({ error: "Provider only" });
            const ProviderHistory = require("../models/ProviderHistory");
            const history = await ProviderHistory.find({ providerId: req.user.id }).sort({ completedAt: -1 }).populate("bookingId").populate("userId", "name email");
            res.json(history);
          } catch (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
          }
        }
      );

// =====================================================
// UPDATE STATUS
// =====================================================

router.put(
  "/status/:bookingId",
  verifyToken,
  async (req, res) => {
    try {
      const booking = await Booking.findById(req.params.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (req.user.role !== "admin" && booking.userId.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to update this booking" });
      }

      booking.status = req.body.status || booking.status;
      await booking.save();

      const io = req.app.get("io");
      if (io) {
        io.emit("booking-update", {
          bookingId: booking._id,
          status: booking.status
        });
      }

      res.json(booking);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  "/status/:bookingId",
  verifyToken,
  async (req, res) => {
    try {
      const booking = await Booking.findById(req.params.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (req.user.role !== "admin" && booking.userId.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to update this booking" });
      }
      booking.status = req.body.status || booking.status;
      await booking.save();
      const io = req.app.get("io");
      if (io) {
        io.emit("booking-update", {
          bookingId: booking._id,
          status: booking.status
        });
      }
      res.json(booking);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);


// =====================================================
// DELETE BOOKING
// =====================================================

router.delete(
  "/:bookingId",
  verifyToken,
  async (req, res) => {
    try {
      const booking = await Booking.findById(req.params.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (req.user.role !== "admin" && booking.userId.toString() !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to delete this booking" });
      }
      await Booking.findByIdAndDelete(req.params.bookingId);
      res.json({ success: true, message: "Booking deleted" });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);

router.get(
  "/",
  verifyToken,
  async (req, res) => {

    try {

      const bookings =
        await Booking.find()

        .populate(
          "userId",
          "name email"
        )

        .populate(
          "providerId",
          "name email"
        )

        .sort({
          createdAt: -1
        });

      res.json(bookings);

    } catch (err) {

      console.log(err);

      res.status(500).json({
        error: err.message
      });

    }

  }
);

module.exports = router;