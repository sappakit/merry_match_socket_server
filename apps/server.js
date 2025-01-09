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

handleSocketConnection(io);
handleNotificationSocket(io);

app.get("/", (req, res) => {
  res.send("Socket server is running");
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Socket server is running on port ${PORT}`);
});
