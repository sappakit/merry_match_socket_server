import { Server } from "socket.io";
import { createServer } from "http";
import express from "express";
import dotenv from "dotenv";

import { handleSocketConnection } from "./handlers/socketHandlers.js";
import { handleNotificationSocket } from "./handlers/notificationHandlers.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const allowedOrigin = process.env.CORS_ORIGIN;

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/socket.io",
});

// Define userSocketMap locally
const userSocketMap = new Map();

// Centralized Socket.IO Connection Handling
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Centralized registerUser event
  socket.on("registerUser", (userId) => {
    if (userId) {
      userSocketMap.set(userId, socket.id);
      console.log(`User ${userId} registered on socket ${socket.id}`);
    }
  });

  // Pass socket and io to specific feature handlers
  handleSocketConnection(io, socket);
  handleNotificationSocket(io, socket, userSocketMap);

  // Handle user disconnection
  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    userSocketMap.forEach((value, key) => {
      if (value === socket.id) {
        userSocketMap.delete(key);
      }
    });
  });
});

app.get("/", (req, res) => {
  res.send("Socket server is running");
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Socket server is running on port ${PORT}`);
});
