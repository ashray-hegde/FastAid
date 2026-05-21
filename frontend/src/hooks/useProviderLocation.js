import { useEffect } from "react";
import api from "../api";
import socket from "../socket";

export function useProviderLocation() {
  useEffect(() => {
    // Only for providers
    const token = localStorage.getItem("token");
    if (!token) return;

    let decodedToken;
    try {
      decodedToken = JSON.parse(atob(token.split(".")[1]));
      if (decodedToken?.role !== "provider") return;
    } catch (err) {
      return;
    }

    // Request geolocation permission
    if (!navigator.geolocation) {
      console.error("Geolocation not supported");
      return;
    }

    // Get initial location
    const getLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // Store in database
          api.put("/auth/update-location", {
            latitude,
            longitude,
            address: ""
          }).catch(err => console.error("Failed to update location:", err));

          // Emit via socket for real-time updates
          socket.emit("provider-location", {
            providerId: decodedToken.id,
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

    // Watch position for continuous updates (more accurate)
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // Emit only if position changed significantly (at least 10 meters)
        // This is to avoid constant socket emissions for minor GPS fluctuations
        socket.emit("provider-location", {
          providerId: decodedToken.id,
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
