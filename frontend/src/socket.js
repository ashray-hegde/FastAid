import { io } from "socket.io-client";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

let socket = null;

const getSocket = () => {
  if (!socket) {
    socket = io(API_BASE_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      autoConnect: true // allow socket to auto-connect and handle reconnection
    });

    socket.on("connect", () => {
      if (process.env.NODE_ENV !== "production") console.log("Socket connected:", socket.id);
      const token = localStorage.getItem("token");
      if (token) {
        socket.emit("register", { token });
      }
    });

    socket.on("reconnect", (attempt) => {
      if (process.env.NODE_ENV !== "production") console.log("Socket reconnected after attempt", attempt);
      const token = localStorage.getItem("token");
      if (token) {
        socket.emit("register", { token });
      }
    });

    socket.on("disconnect", (reason) => {
      if (process.env.NODE_ENV !== "production") console.warn("Socket disconnected. Reason:", reason);
      // If disconnect was not initiated by client, attempt to reconnect
      if (reason && reason !== "io client disconnect") {
        try {
          setTimeout(() => {
            if (socket && !socket.connected) socket.connect();
          }, 1000);
        } catch (e) {
          if (process.env.NODE_ENV !== "production") console.error("Socket reconnect attempt failed:", e);
        }
      }
    });

    socket.on("connect_error", (error) => {
      if (process.env.NODE_ENV !== "production") console.log("Socket connection error:", error);
    });
  }
  return socket;
};

export default getSocket;