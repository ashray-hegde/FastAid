import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import socket from "../socket";
import "leaflet/dist/leaflet.css";

const defaultCenter = { lat: 19.0760, lng: 72.8777 }; // Mumbai

function Recenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng]);
  }, [position, map]);
  return null;
}

export default function LiveMap({ providerLocation, providerId, bookingId }) {
  const [userLocation, setUserLocation] = useState(null);
  const [liveProviderLocation, setLiveProviderLocation] = useState(providerLocation || null);
  const providerRef = useRef(null);

  // Watch user location
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // update from prop
  useEffect(() => {
    if (providerLocation) setLiveProviderLocation(providerLocation);
  }, [providerLocation]);

  useEffect(() => {
    const handler = (data) => {
      // accept either lat/lng or latitude/longitude
      const lat = data.lat ?? data.latitude;
      const lng = data.lng ?? data.longitude;
      if (!lat || !lng) return;
      if (!providerId || data.providerId === providerId) {
        setLiveProviderLocation({ lat, lng });
      }
    };

    socket.on("providerLocationUpdate", handler);

    // Join booking room for room-scoped updates
    const token = localStorage.getItem("token");
    if (bookingId && token) {
      try {
        const decoded = JSON.parse(atob(token.split(".")[1]));
        socket.emit("join-booking", { bookingId, userId: decoded.id, token });
      } catch (e) {}
    }

    return () => {
      socket.off("providerLocationUpdate", handler);
    };
  }, [providerId, bookingId]);

  // animate provider marker (simple setLatLng via ref)
  useEffect(() => {
    if (providerRef.current && liveProviderLocation) {
      providerRef.current.setLatLng([liveProviderLocation.lat, liveProviderLocation.lng]);
    }
  }, [liveProviderLocation]);

  const center = userLocation || liveProviderLocation || defaultCenter;

  return (
    <div>
      <MapContainer center={[center.lat, center.lng]} zoom={15} style={{ height: "400px", width: "100%", borderRadius: 12 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter position={center} />

        {userLocation && (
          <Circle center={[userLocation.lat, userLocation.lng]} radius={8} pathOptions={{ color: "#007bff" }} />
        )}

        {liveProviderLocation && (
          <Marker
            position={[liveProviderLocation.lat, liveProviderLocation.lng]}
            ref={(el) => {
              if (el && el.getElement) {
                providerRef.current = el;
              }
            }}
          />
        )}
      </MapContainer>

      <button
        onClick={() => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition((pos) => {
            setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          });
        }}
        style={{ marginTop: 10, padding: "8px 15px", borderRadius: 8, background: "#007bff", color: "white", border: "none" }}
      >
        Use My Current Location
      </button>
    </div>
  );
}
