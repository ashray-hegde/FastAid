import { useEffect, useMemo, useState, useRef } from "react";
import { GoogleMap, Marker, Polyline, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";
import getSocket from "../socket";
// Debug: Track rerenders
if (process.env.NODE_ENV !== "production") console.log("LiveMap rerender");
import { decodeJwt } from "../utils/token";

const defaultCenter = { lat: 19.076, lng: 72.8777 };
const containerStyle = { width: "100%", height: "520px", borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 90px rgba(15, 23, 42, 0.12)" };

const bikeIcon = {
  path: "M18.5 4.52c-2.93 0-5.31 2.29-5.31 5.11 0 .72.18 1.4.5 1.99l-4.6.56c-.14-.5-.22-1.02-.22-1.57 0-3.38 2.8-6.14 6.24-6.14 1.73 0 3.29.72 4.38 1.86l2.16-2.16c.2-.2.5-.2.7 0l.85.84c.2.2.2.5 0 .7l-2.16 2.16c1.03 1.2 1.68 2.78 1.68 4.57 0 3.04-2.47 5.51-5.5 5.51-2.51 0-4.65-1.61-5.26-3.81-.22-.74-.22-1.5 0-2.24l4.92-.59c.16.37.35.73.57 1.07.54.82 1.35 1.44 2.33 1.69.63.15 1.27.17 1.9.06.28-.05.5-.28.54-.55.04-.27-.07-.54-.29-.72l-.7-.59c-.25-.21-.58-.2-.83.03-.18.16-.33.34-.46.53-.13-.18-.27-.35-.44-.5l-.56-.42c-.23-.17-.55-.16-.77.02-.22.18-.3.47-.19.73.47 1.04 1.55 1.67 2.72 1.5 1.09-.16 1.95-.94 2.12-2.03.15-.9-.28-1.74-1.03-2.23-.64-.41-1.4-.51-2.11-.31-.46.13-.92.38-1.3.74-.31.3-.86.29-1.17-.01-.33-.31-.35-.83-.05-1.16.63-.7 1.48-1.04 2.34-.93 1.45.2 2.51 1.43 2.33 2.86-.15 1.1-.98 1.96-2.09 2.19-1.18.25-2.35-.25-3.03-1.2-.14-.2-.4-.28-.63-.18l-3.64.43c-.14.02-.27.08-.39.17-.57.46-.92 1.11-1.01 1.82-.18 1.37.78 2.62 2.1 2.79 1.06.14 2.05-.38 2.55-1.24.11-.18.32-.27.53-.19l8.5 2.55c.61.18 1.24-.22 1.42-.83.18-.61-.22-1.24-.83-1.42l-6.65-2.01c-.22-.07-.45-.05-.65.05-.3.16-.67.08-.9-.21-.2-.25-.25-.57-.13-.86l1.57-3.28c.17-.35.1-.76-.18-1.04l-3.11-3.11c-.29-.29-.7-.36-1.05-.21-.35.15-.59.49-.59.86v3.27c0 .55-.45 1-1 1h-2.5c-.55 0-1 .45-1 1v2.5c0 .55.45 1 1 1h1.75c.55 0 1-.45 1-1v-2.5h1.5v.75c0 .55.45 1 1 1h.73c.55 0 1-.45 1-1v-1.23c1.42-.33 2.67-1.14 3.49-2.28.95-1.4.99-3.21.11-4.66-.89-1.47-2.56-2.37-4.24-2.37z",
  fillColor: "#0ea5e9",
  fillOpacity: 0.9,
  strokeColor: "#0284c7",
  strokeWeight: 1.5,
  scale: 0.7,
  anchor: { x: 15, y: 15 }
};

export default function LiveMap({ providerLocation, providerId, bookingId, customerLocation, provider, serviceName }) {
  // Memoize socket instance
  const socket = useMemo(() => getSocket(), []);
  const [userLocation, setUserLocation] = useState(null);
  const [liveProviderLocation, setLiveProviderLocation] = useState(providerLocation || null);
  const [animatedProviderLocation, setAnimatedProviderLocation] = useState(providerLocation || null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [statusLabel, setStatusLabel] = useState("En route");
  const [directions, setDirections] = useState(null);
  const [map, setMap] = useState(null);
  const vehicleMarkerRef = useRef(null);
  const routeRequestRef = useRef({ origin: null, destination: null, timestamp: 0 });
  const animationFrameRef = useRef(null);

  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"]
  });

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (err) => console.warn("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const destinationLocation = customerLocation || userLocation;
  const providerName = provider?.name || "Provider";
  const providerInitials = providerName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (providerLocation) {
      setLiveProviderLocation(providerLocation);
      setLastUpdated(providerLocation.updatedAt ? new Date(providerLocation.updatedAt) : new Date());
    }
  }, [providerLocation]);

  useEffect(() => {
    // Debug: Log effect run
    if (process.env.NODE_ENV !== "production") console.log("LiveMap useEffect: providerId, bookingId", { providerId, bookingId });
    const handler = (data) => {
      if (process.env.NODE_ENV !== "production") console.log("providerLocationUpdate event", data);
      const lat = data.lat ?? data.latitude;
      const lng = data.lng ?? data.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (!providerId || data.providerId === providerId) {
        const nextProviderLocation = { lat, lng, updatedAt: data.timestamp || new Date() };
        setLiveProviderLocation(nextProviderLocation);
        setLastUpdated(data.timestamp ? new Date(data.timestamp) : new Date());
      }
    };

    socket.on("providerLocationUpdate", handler);

    const token = localStorage.getItem("token");
    if (bookingId && token) {
      const decoded = decodeJwt(token);
      if (decoded?.id) {
        socket.emit("join-booking", { bookingId, userId: decoded.id, token });
        if (process.env.NODE_ENV !== "production") console.log("Emitted join-booking", { bookingId, userId: decoded.id });
      }
    }

    return () => {
      socket.off("providerLocationUpdate", handler);
      if (process.env.NODE_ENV !== "production") console.log("Cleaned up providerLocationUpdate handler");
    };
  }, [providerId, bookingId, socket]);

  useEffect(() => {
    if (!liveProviderLocation) return;

    if (!animatedProviderLocation) {
      setAnimatedProviderLocation(liveProviderLocation);
      return;
    }

    if (
      animatedProviderLocation.lat === liveProviderLocation.lat &&
      animatedProviderLocation.lng === liveProviderLocation.lng
    ) {
      return;
    }

    const start = animatedProviderLocation;
    const end = liveProviderLocation;
    const duration = 700;
    const startTime = performance.now();

    const animate = (timestamp) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const nextLat = start.lat + (end.lat - start.lat) * ease;
      const nextLng = start.lng + (end.lng - start.lng) * ease;
      setAnimatedProviderLocation({ lat: nextLat, lng: nextLng, updatedAt: end.updatedAt });
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [liveProviderLocation, animatedProviderLocation]);

  useEffect(() => {
    if (!isLoaded || !liveProviderLocation || !destinationLocation) return;
    const now = Date.now();
    const shouldRecalcRoute = (() => {
      const last = routeRequestRef.current;
      if (!last.origin || !last.destination) return true;
      const distanceMoved = haversineDistance(last.origin.lat, last.origin.lng, liveProviderLocation.lat, liveProviderLocation.lng);
      if (distanceMoved > 0.05) return true;
      if (now - last.timestamp > 15000) return true;
      if (last.destination.lat !== destinationLocation.lat || last.destination.lng !== destinationLocation.lng) return true;
      return false;
    })();

    if (!shouldRecalcRoute) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: liveProviderLocation,
        destination: destinationLocation,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: "bestguess"
        },
        optimizeWaypoints: false,
        provideRouteAlternatives: false
      },
      (result, status) => {
        if (status === "OK" && result?.routes?.length) {
          const leg = result.routes[0].legs[0];
          setDirections(result);
          setDistanceKm(leg.distance?.value ? leg.distance.value / 1000 : null);
          setEtaMinutes(leg.duration?.value ? Math.max(1, Math.round(leg.duration.value / 60)) : null);
          setStatusLabel(leg.duration?.value ? `Arriving in ${Math.max(1, Math.round(leg.duration.value / 60))} min` : "En route");
        } else {
          console.warn("Directions request failed:", status);
          setDirections(null);
        }
      }
    );

    routeRequestRef.current = {
      origin: liveProviderLocation,
      destination: destinationLocation,
      timestamp: now
    };
  }, [isLoaded, liveProviderLocation, destinationLocation]);

  useEffect(() => {
    if (map && liveProviderLocation && destinationLocation) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(liveProviderLocation);
      bounds.extend(destinationLocation);
      map.fitBounds(bounds, 64);
    }

    if (!directions && liveProviderLocation && destinationLocation) {
      const toRad = (value) => (value * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(destinationLocation.lat - liveProviderLocation.lat);
      const dLng = toRad(destinationLocation.lng - liveProviderLocation.lng);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(liveProviderLocation.lat)) * Math.cos(toRad(destinationLocation.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      setDistanceKm(distance);
      const speed = 0.4;
      setEtaMinutes(Math.max(1, Math.round(distance / speed)));
      setStatusLabel(distance <= 0.2 ? "Almost there" : "En route");
    }
  }, [map, liveProviderLocation, destinationLocation, directions]);

  const routePath = useMemo(() => {
    if (liveProviderLocation && destinationLocation) {
      return [liveProviderLocation, destinationLocation];
    }
    return [];
  }, [liveProviderLocation, destinationLocation]);

  if (loadError) {
    console.error("Google Maps load error:", loadError);
    return (
      <div className="map-error">
        <div>Google Maps failed to load.</div>
        <div>{loadError.message || "Please check your API key and browser restrictions."}</div>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="map-placeholder">Loading live map...</div>;
  }

  return (
    <div className="live-map-wrapper">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={liveProviderLocation || destinationLocation || defaultCenter}
        zoom={15}
        onLoad={(mapInstance) => setMap(mapInstance)}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { featureType: "poi.business", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] }
          ]
        }}
      >
        {destinationLocation && (
          <Marker
            position={destinationLocation}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: "#2563eb",
              fillOpacity: 0.9,
              scale: 7,
              strokeColor: "#ffffff",
              strokeWeight: 2
            }}
          />
        )}

        {animatedProviderLocation && (
          <Marker
            position={animatedProviderLocation}
            icon={bikeIcon}
            ref={vehicleMarkerRef}
          />
        )}

        {directions ? (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: { strokeColor: "#0ea5e9", strokeOpacity: 0.85, strokeWeight: 6 }
            }}
          />
        ) : (
          routePath.length === 2 && (
            <Polyline
              path={routePath}
              options={{ strokeColor: "#0ea5e9", strokeOpacity: 0.8, strokeWeight: 5, geodesic: true }}
            />
          )
        )}
      </GoogleMap>

      {provider && (
        <div className="provider-overlay">
          <div className="provider-avatar">{providerInitials}</div>
          <div className="provider-details">
            <div className="provider-name">{providerName}</div>
            <div className="provider-role">{serviceName || provider?.service || "Service provider"}</div>
            <div className="provider-meta">
              <span className="provider-meta-pill">{statusLabel}</span>
              {distanceKm !== null && <span className="provider-meta-pill">{distanceKm.toFixed(1)} km</span>}
            </div>
          </div>
        </div>
      )}

      <div className="tracking-panel tracking-panel-modern">
        <div className="tracking-pill">Live provider tracking</div>
        <div className="tracking-row tracking-row-status">
          <div>
            <div className="tracking-label">Status</div>
            <div className="tracking-value">{statusLabel}</div>
          </div>
          <div>
            <div className="tracking-label">Last update</div>
            <div className="tracking-value">{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</div>
          </div>
        </div>
        <div className="tracking-row">
          <div>
            <div className="tracking-label">Distance</div>
            <div className="tracking-value">{distanceKm !== null ? `${distanceKm.toFixed(1)} km` : destinationLocation ? "Calculating..." : "Location unavailable"}</div>
          </div>
          <div>
            <div className="tracking-label">ETA</div>
            <div className="tracking-value">{etaMinutes !== null ? `${etaMinutes} min` : destinationLocation ? "Estimating..." : "Location unavailable"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
