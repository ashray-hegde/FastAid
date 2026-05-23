const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { JWT_SECRET } = require("../utils/verifyToken");
const Booking = require("../models/Booking");
const User = require("../models/User");
const Provider = require("../models/Provider");

const connectedUsers = new Map();
const providerLocations = new Map(); // Store latest location per provider

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const computeEtaMinutes = (distanceKm) => {
  if (distanceKm === null || distanceKm === undefined) return null;
  const speedKmPerMin = 0.4; // ~24 km/h average in city
  return Math.max(1, Math.round(distanceKm / speedKmPerMin));
};

const addUserSocket = (userId, socketId) => {
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socketId);
};

const removeUserSocket = (userId, socketId) => {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    connectedUsers.delete(userId);
    providerLocations.delete(userId);
  }
};

module.exports = (io) => {

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("register", async ({ token }) => {
      try {
        if (!token) return;
        const decoded = jwt.verify(token, JWT_SECRET);
        const userId = decoded.id;
        addUserSocket(userId, socket.id);
        socket.join(`user-${userId}`);
        socket.join(`provider-${userId}`);
        console.log(`User Registered: ${userId}`);
      } catch (err) {
        console.log("Socket auth failed", err.message || err);
      }
    });

    socket.on("join-booking", async ({ bookingId, userId, token }) => {
      try {
        if (!token || !bookingId || !userId) return;
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.id !== userId) return;

        const booking = await Booking.findById(bookingId).lean();
        if (!booking) return;
        const allowed =
          booking.userId?.toString() === userId.toString() ||
          booking.providerId?.toString() === userId.toString();
        if (!allowed) return;

        socket.join(`booking-${bookingId}`);
        console.log(`User ${userId} joined booking ${bookingId}`);

        const providerId = booking.providerId?.toString();
        if (providerId) {
          const lastLocation = providerLocations.get(providerId);
          if (lastLocation) {
            socket.emit("providerLocationUpdate", {
              providerId,
              bookingId,
              latitude: lastLocation.latitude,
              longitude: lastLocation.longitude,
              lat: lastLocation.latitude,
              lng: lastLocation.longitude,
              timestamp: lastLocation.timestamp
            });
          }
        }
      } catch (err) {
        console.log("Join booking auth failed", err.message || err);
      }
    });

    socket.on("provider-location", async (data) => {
      try {
        const { providerId, bookingId, latitude, longitude, token } = data;
        if (!token || !providerId || typeof latitude !== "number" || typeof longitude !== "number") return;

        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.id !== providerId) return;

        const timestamp = new Date();
        providerLocations.set(providerId, { latitude, longitude, timestamp, bookingId });

        await Provider.findOneAndUpdate(
          { userId: providerId },
          {
            currentLocation: { lat: latitude, lng: longitude },
            lastOnlineAt: timestamp
          },
          { new: true }
        );

        await User.findByIdAndUpdate(providerId, {
          location: {
            type: "Point",
            coordinates: [longitude, latitude],
            address: "",
            city: "",
            state: "",
            postalCode: ""
          },
          lastLocationUpdate: timestamp
        });

        let booking = null;
        if (bookingId) {
          booking = await Booking.findById(bookingId);
        }

        let etaMinutes = null;
        let statusChanged = false;
        let previousStatus = null;

        if (booking) {
          previousStatus = booking.status;
          const bookingLat = booking.coordinates?.lat;
          const bookingLng = booking.coordinates?.lng;
          if (typeof bookingLat === "number" && typeof bookingLng === "number") {
            const distanceKm = haversineDistance(latitude, longitude, bookingLat, bookingLng);
            etaMinutes = computeEtaMinutes(distanceKm);
            booking.tracking = {
              providerLat: latitude,
              providerLng: longitude,
              updatedAt: timestamp
            };
            booking.etaMinutes = etaMinutes;

            if (distanceKm <= 0.08 && !["reached", "completed", "cancelled"].includes(booking.status)) {
              booking.status = "reached";
              statusChanged = true;
            }

            await booking.save();
          } else {
            booking.tracking = {
              providerLat: latitude,
              providerLng: longitude,
              updatedAt: timestamp
            };
            await booking.save();
          }
        }

        const locationPayload = {
          providerId,
          bookingId,
          latitude,
          longitude,
          lat: latitude,
          lng: longitude,
          timestamp,
          distanceKm,
          etaMinutes
        };

        if (bookingId && booking) {
          io.to(`booking-${bookingId}`).emit("providerLocationUpdate", locationPayload);
          if (booking.userId) {
            io.to(`user-${booking.userId.toString()}`).emit("providerLocationUpdate", locationPayload);
          }
        }

        io.to(`provider-${providerId}`).emit("providerLocationUpdate", locationPayload);

        if (booking && statusChanged) {
          const bookingUpdatePayload = {
            bookingId: booking._id,
            status: booking.status,
            etaMinutes
          };
          io.to(`booking-${bookingId}`).emit("booking-update", bookingUpdatePayload);
          if (booking.userId) {
            io.to(`user-${booking.userId.toString()}`).emit("booking-update", bookingUpdatePayload);
          }
        }
      } catch (err) {
        console.error("Location update error:", err.message || err);
      }
    });

    socket.on("get-provider-location", ({ providerId }, callback) => {
      try {
        const location = providerLocations.get(providerId);
        if (callback) {
          callback(location || null);
        }
      } catch (err) {
        console.error("Get location error:", err.message || err);
        if (callback) callback(null);
      }
    });

    socket.on("disconnect", () => {
      for (const [userId, sockets] of connectedUsers.entries()) {
        if (sockets.has(socket.id)) {
          removeUserSocket(userId, socket.id);
          break;
        }
      }
      console.log("Socket disconnected:", socket.id);
    });
  });

  return connectedUsers;
};