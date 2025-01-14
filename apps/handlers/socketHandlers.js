import connectionPool from "../../utils/db.js";
import { Timestamp } from "firebase-admin/firestore";
import { db, adminSdk } from "../../utils/adminFirebase.js";

// Function to handle chat notifications
const handleChatNotification = async (chat_id, recipientId, messagePayload) => {
  try {
    const notificationQuery = `
      INSERT INTO notification_chats
      (chat_id, conten_chat, user_sender_id, user_receiver_id, message_id, is_read)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const notificationValues = [
      chat_id,
      messagePayload.content,
      messagePayload.sender_id,
      recipientId,
      messagePayload.message_id,
      false,
    ];

    await connectionPool.query(notificationQuery, notificationValues);

    console.log(
      `Notification stored for user ${recipientId} in chat_id ${chat_id}`
    );
  } catch (error) {
    console.error("Error handling chat notification:", error);
  }
};

export const handleSocketConnection = (io, socket, userSocketMap) => {
  // Join room event
  socket.on("joinRoom", (chatRoomId) => {
    socket.join(chatRoomId);
    console.log(`User ${socket.id} joined room ${chatRoomId}`);
  });

  // Leave room event
  socket.on("leaveRoom", (chatRoomId) => {
    socket.leave(chatRoomId);
    console.log(`User ${socket.id} left room ${chatRoomId}`);
  });

  // Send message event
  socket.on(
    "sendMessage",
    async ({ chatRoomId, inputMessage, imageUrls, userId, messageType }) => {
      if (
        !chatRoomId ||
        (!inputMessage && imageUrls.length === 0) ||
        !userId ||
        messageType.length === 0
      ) {
        console.error("Invalid data for sending message:", {
          chatRoomId,
          inputMessage,
          imageUrls,
          userId,
          messageType,
        });
        return;
      }

      const payload = {
        message_id: db.collection("dummy").doc().id,
        sender_id: userId,
        type: messageType,
        content: inputMessage || null,
        image_urls: imageUrls || [],
        timestamp: Timestamp.now(),
      };

      try {
        const chatRoomRef = db.collection("chat_rooms").doc(chatRoomId);
        await chatRoomRef.update({
          messages: adminSdk.firestore.FieldValue.arrayUnion(payload),
          lastMessage: payload,
        });

        // Emit the message to users in the chat room
        io.to(chatRoomId).emit("receiveMessage", payload);

        io.to(chatRoomId).emit("updateChats");

        // Notification part
        // Fetch chat_id and participants from the "chats" table
        const chatQuery = `
         SELECT chat_id, user_master, user_other
         FROM chats
         WHERE chat_room_id = $1 AND user_master = $2
       `;
        const chatResult = await connectionPool.query(chatQuery, [
          chatRoomId,
          userId,
        ]);

        const { chat_id, user_master, user_other } = chatResult.rows[0];

        // Determine the recipient (the other participant in the chat room)
        const recipientId = userId === user_master ? user_other : user_master;

        // Check if the recipient is currently in the chat room
        const isInRoom = io.sockets.adapter.rooms
          .get(chatRoomId)
          ?.has(userSocketMap.get(recipientId));

        // If the recipient is not in the room, handle notifications
        if (!isInRoom) {
          await handleChatNotification(
            chat_id,
            recipientId,
            payload,
            chatRoomId
          );
        }
      } catch (error) {
        console.error("Error updating messages array:", error);
      }
    }
  );
};
