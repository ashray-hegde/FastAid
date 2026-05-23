import { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "./ToastContext";
import api from "../api";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, savedForLater: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCart = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/cart");
      setCart(data);
      setLoading(false);
    } catch (err) {
      setError(err.message || "Unable to load cart");
      setLoading(false);
    }
  };

  const { addToast } = useToast();

  const addToCart = async (item) => {
    try {
      const payload = {
        serviceId: item.serviceId,
        quantity: item.quantity || 1,
        price: item.price,
        description: item.description || item.serviceName,
        savedForLater: item.savedForLater || false
      };
      await api.post("/cart/add", payload);
      await loadCart();
      addToast("Added to cart", "success");
    } catch (err) {
      setError(err.message || "Failed to add item to cart");
      addToast("Failed to add item to cart", "error");
    }
  };

  const updateItem = async (itemId, updates) => {
    try {
      await api.put(`/cart/item/${itemId}`, updates);
      await loadCart();
    } catch (err) {
      setError(err.message || "Unable to update cart item");
    }
  };

  const removeItem = async (itemId) => {
    try {
      const id = String(itemId);
      await api.delete(`/cart/item/${id}`);
      await loadCart();
      addToast("Removed from cart", "info");
    } catch (err) {
      setError(err.message || "Unable to remove cart item");
      addToast("Unable to remove cart item", "error");
      // Always try to reload cart to avoid stale UI
      await loadCart();
    }
  };

  const clearCart = async () => {
    try {
      await api.delete("/cart/clear");
      setCart({ items: [], total: 0, savedForLater: [] });
      addToast("Cart cleared", "info");
    } catch (err) {
      setError(err.message || "Unable to clear cart");
      addToast("Unable to clear cart", "error");
    }
  };

  useEffect(() => {
    loadCart();
  }, []);

  return (
    <CartContext.Provider value={{ cart, loading, error, loadCart, addToCart, updateItem, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
