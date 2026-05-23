import { useEffect } from "react";
import api from "../api";
import getSocket from "../socket";
import { decodeJwt } from "../utils/token";

export function useProviderLocation() {
  useEffect(() => {
    // Only for providers
    const token = localStorage.getItem("token");
    if (!token) return;

    const decodedToken = decodeJwt(token);
    if (!decodedToken || decodedToken.role !== "provider") return;

    // Request geolocation permission
    if (!navigator.geolocation) {
      console.error("Geolocation not supported");
      return;
    }

    const getCurrentBookingId = () => window.localStorage.getItem("currentBookingId");

    // Get initial location
    const getLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const bookingId = getCurrentBookingId();

          // Store in database
          api.put("/auth/update-location", {
            latitude,
            longitude,
            address: ""
          }).catch(err => console.error("Failed to update location:", err));

          // Emit via socket for real-time updates
          getSocket().emit("provider-location", {
            providerId: decodedToken.id,
            bookingId,
            latitude,
            longitude,
            token
          });
        },
        (error) => {
          console.error("Geolocation error:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    };

    // Get location immediately
    getLocation();

    // Update location periodically every 30 seconds while provider is active
    const locationInterval = setInterval(getLocation, 30000);

    let lastLatitude = null;
    let lastLongitude = null;

    // Watch position for continuous updates (more accurate)
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const bookingId = getCurrentBookingId();

        const movedDistance = lastLatitude !== null && lastLongitude !== null
          ? Math.sqrt(Math.pow(latitude - lastLatitude, 2) + Math.pow(longitude - lastLongitude, 2))
          : Number.MAX_VALUE;

        if (movedDistance < 0.0001) {
          return;
        }

        lastLatitude = latitude;
        lastLongitude = longitude;

        getSocket().emit("provider-location", {
          providerId: decodedToken.id,
          bookingId,
          latitude,
          longitude,
          token
        });
      },
      (error) => {
        console.error("Watch position error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000 // Accept cached position up to 5 seconds old
      }
    );

    // Cleanup
    return () => {
      clearInterval(locationInterval);
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);
}
