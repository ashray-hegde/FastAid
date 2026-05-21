import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix default icon paths for Leaflet when used with webpack/CRA
if (L && L.Icon && L.Icon.Default) {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
}
import "leaflet/dist/leaflet.css";
import api from "../api";
import citiesData from "indian-cities-json";

const DEFAULT_CENTER = { lat: 19.0760, lng: 72.8777 };
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

function normalize(str) {
  return String(str ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function decodeCity(item) {
  const name = item.city || item.name || item.place || item.city_name || item.CITY || "";
  const state = item.state || item.region || item.ST || item.state_name || "";
  const lat = Number(item.latitude ?? item.lat ?? item.Latitude ?? item.LAT);
  const lng = Number(item.longitude ?? item.lng ?? item.Longitude ?? item.LNG);

  return {
    name: String(name),
    state: String(state),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

export default function LocationPickerLeaflet({
  value,
  onChange,
  coordinates,
  onCoordinatesChange,
  onAddressSelect,
  placeholder = "Enter city or address",
  maxSuggestions = 8,
}) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [map, setMap] = useState(null);
  const [marker, setMarker] = useState(null);
  const rootRef = useRef(null);
  const mapContainer = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Load saved addresses
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api
        .get("/auth/addresses")
        .then((resp) => {
          setSavedAddresses(resp.data || []);
        })
        .catch(() => {
          const saved = window.localStorage.getItem("savedAddresses");
          if (saved) {
            try {
              setSavedAddresses(JSON.parse(saved));
            } catch {
              setSavedAddresses([]);
            }
          }
        });
    } else {
      const saved = window.localStorage.getItem("savedAddresses");
      if (saved) {
        try {
          setSavedAddresses(JSON.parse(saved));
        } catch {
          setSavedAddresses([]);
        }
      }
    }
  }, []);

  const allCities = useMemo(() => {
    const raw = Array.isArray(citiesData) ? citiesData : citiesData?.cities || citiesData?.data || [];
    return raw.map(decodeCity).filter((c) => c.name);
  }, []);

  const suggestions = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];

    const scored = [];
    for (const c of allCities) {
      const name = normalize(c.name);
      const state = normalize(c.state);
      if (!name.includes(q) && !state.includes(q)) continue;

      const score =
        (name.startsWith(q) ? 3 : 0) +
        (state.startsWith(q) ? 2 : 0) +
        (name.includes(q) ? 1 : 0);
      scored.push({ c, score });
    }

    scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
    return scored.slice(0, maxSuggestions).map((s) => s.c);
  }, [allCities, query, maxSuggestions]);

  const saveCurrentAddress = () => {
    const trimmed = query.trim();
    if (!trimmed || !coordinates) return;
    const next = {
      label: trimmed,
      street: trimmed,
      city: trimmed,
      state: "",
      postalCode: "",
      coordinates,
      createdAt: new Date().toISOString(),
    };

    const token = localStorage.getItem("token");
    if (token) {
      api
        .post("/auth/addresses", next)
        .then((resp) => {
          setSavedAddresses(resp.data || []);
        })
        .catch(() => {
          const nextSaved = [next, ...savedAddresses].slice(0, 5);
          setSavedAddresses(nextSaved);
          window.localStorage.setItem("savedAddresses", JSON.stringify(nextSaved));
        });
    } else {
      const nextSaved = [next, ...savedAddresses].slice(0, 5);
      setSavedAddresses(nextSaved);
      window.localStorage.setItem("savedAddresses", JSON.stringify(nextSaved));
    }
  };

  const commitCity = (city) => {
    const nextName = city.state && !city.name.toLowerCase().includes(city.state.toLowerCase())
      ? `${city.name}, ${city.state}`
      : city.name;

    setQuery(nextName);
    onChange(nextName);
    setOpen(false);

    const coords = city.lat != null && city.lng != null ? { lat: city.lat, lng: city.lng } : null;
    onCoordinatesChange(coords);

    const details = {
      street: city.name,
      city: city.name,
      state: city.state || "",
      postalCode: "",
      coordinates: coords,
    };
    if (onAddressSelect) onAddressSelect(details);
  };

  const reverseGeocodeToCity = async (lat, lng) => {
    const url = new URL(`${NOMINATIM_BASE}/reverse`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);

      const data = await res.json();
      const addr = data?.address || {};

      const cityLike = addr.city || addr.town || addr.village || addr.municipality || addr.hamlet || "";
      const state = addr.state || "";

      if (cityLike) return state ? `${cityLike}, ${state}` : cityLike;
      if (addr.county) return addr.county;
      if (data?.display_name) return data.display_name;

      throw new Error("No readable city name found");
    } finally {
      clearTimeout(timeout);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus("Geolocation not supported by this browser");
      return;
    }

    setGpsLoading(true);
    setStatus("");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const coords = { lat, lng };

        try {
          const cityName = await reverseGeocodeToCity(lat, lng);
          const details = {
            street: cityName,
            city: cityName,
            state: "",
            postalCode: "",
            coordinates: coords,
          };

          onCoordinatesChange(coords);
          setQuery(cityName);
          onChange(cityName);
          setOpen(false);
          setMapCenter(coords);
          setShowMapPicker(true);
          setStatus("Current location detected. Refine on map for exact accuracy.");
          if (onAddressSelect) onAddressSelect(details);
        } catch (e) {
          console.warn("Reverse geocode error:", e);
          const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          onCoordinatesChange(coords);
          setQuery(fallback);
          onChange(fallback);
          setMapCenter(coords);
          setShowMapPicker(true);
          setStatus("Location detected. Refine on map for accuracy.");
        } finally {
          setGpsLoading(false);
        }
      },
      (err) => {
        console.warn("Geolocation error:", err);
        setGpsLoading(false);

        if (err?.code === 1) {
          setStatus("Permission denied. Choose a city from suggestions.");
        } else if (err?.code === 2) {
          setStatus("Location unavailable. Choose a city from suggestions.");
        } else if (err?.code === 3) {
          setStatus("Location request timed out. Choose a city from suggestions.");
        } else {
          setStatus("Location error. Choose a city from suggestions.");
        }

        setOpen(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const openMapPicker = () => {
    setShowMapPicker((prev) => !prev);
    setMapCenter(coordinates || DEFAULT_CENTER);
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!showMapPicker || !mapContainer.current) return;

    // Cleanup old map
    if (map) {
      map.remove();
    }

    const newMap = L.map(mapContainer.current).setView(
      [mapCenter.lat, mapCenter.lng],
      13
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(newMap);

    // Add marker
    if (coordinates) {
      const newMarker = L.marker([coordinates.lat, coordinates.lng])
        .addTo(newMap)
        .bindPopup("Selected location");
      setMarker(newMarker);
    }

    // Handle map clicks
    newMap.on("click", (e) => {
      const { lat, lng } = e.latlng;
      const nextCoordinates = { lat, lng };

      if (marker) {
        marker.remove();
      }

      const newMarker = L.marker([lat, lng])
        .addTo(newMap)
        .bindPopup("Selected location");
      setMarker(newMarker);

      onCoordinatesChange(nextCoordinates);
      setMapCenter(nextCoordinates);
      setStatus("Location selected. Click 'Confirm Location' to save.");
    });

    setMap(newMap);

    return () => {
      if (newMap) {
        newMap.remove();
      }
    };
  }, [showMapPicker, mapCenter]);

  const confirmMapLocation = () => {
    if (coordinates) {
      setShowMapPicker(false);
      setStatus("Location confirmed!");
    }
  };

  return (
    <div className="location-picker-container" ref={rootRef}>
      <div className="location-input-row">
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          className="location-input"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            onChange(next);
            onCoordinatesChange(null);
            setOpen(true);
          }}
        />

        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={useCurrentLocation}
          disabled={gpsLoading}
        >
          📍 {gpsLoading ? "Locating..." : "Current Location"}
        </button>
      </div>

      {status && <div className="location-status animate-fade-in">{status}</div>}

      <div className="location-helper-text">
        First detect your current location, then refine the exact address on the map for best accuracy.
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={openMapPicker}
      >
        {showMapPicker ? "Hide Map Picker" : "Open Map Picker"}
      </button>

      {coordinates && (
        <div className="location-coordinates">
          📍 {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
        </div>
      )}

      {showMapPicker && (
        <div className="location-map-wrapper animate-fade-in">
          <div ref={mapContainer} className="location-map" />
          {coordinates && (
            <button
              type="button"
              className="btn btn-success btn-small"
              onClick={confirmMapLocation}
            >
              ✓ Confirm Location
            </button>
          )}
        </div>
      )}

      {open && suggestions.length > 0 && query.trim() && (
        <ul className="location-suggestions">
          {suggestions.map((city) => {
            const label = city.state
              ? `${city.name}, ${city.state}`
              : city.name;
            return (
              <li
                key={`${city.name}-${city.state}`}
                className="location-suggestion-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitCity(city);
                }}
              >
                <span className="suggestion-icon">📍</span>
                {label}
              </li>
            );
          })}
        </ul>
      )}

      {savedAddresses.length > 0 && (
        <div className="saved-addresses-section">
          <h4 className="saved-addresses-title">Saved Addresses</h4>
          <div className="saved-addresses-list">
            {savedAddresses.map((address, index) => (
              <button
                type="button"
                key={`${address.label}-${index}`}
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setQuery(address.label);
                  onChange(address.label);
                  onCoordinatesChange(address.coordinates);
                  if (onAddressSelect) onAddressSelect(address);
                }}
              >
                ⭐ {address.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {open && query.trim() && suggestions.length === 0 && (
        <div className="location-empty">No matching cities found</div>
      )}

      {coordinates && (
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={saveCurrentAddress}
        >
          💾 Save This Address
        </button>
      )}
    </div>
  );
}

