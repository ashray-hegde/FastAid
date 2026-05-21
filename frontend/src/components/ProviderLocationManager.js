import { useEffect } from "react";
import { useProviderLocation } from "../hooks/useProviderLocation";

export default function ProviderLocationManager() {
  // Hook handles permission, updates and socket emits while provider is active
  useProviderLocation();
  return null;
}
