import connectionPool from "../../utils/db.js";
import supabase from "../../utils/supabaseClient.js";

// Fetch matches notification
const fetchMatchNotifications = async (userId) => {
  try {
    const query = `
      SELECT
        notification_matching.is_read,
        notification_matching.user_master_id,
        notification_matching.user_other_id,
        user_profiles.name,
        user_profiles.image_profile[1],
        chats.chat_room_id,
        notification_matching.created_at
      FROM notification_matching
      LEFT JOIN user_profiles
      ON notification_matching.user_other_id = user_profiles.user_id
      LEFT JOIN chats
      ON notification_matching.matching_id = chats.matching_id
      WHERE user_master_id = $1
      ORDER BY notification_matching.created_at DESC
    `;

    const result = await connectionPool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    console.error("Error fetching user notifications:", error);
  }
};

// Fetch chats notification
const fetchChatNotifications = async (userId) => {
  try {
    const query = `
      SELECT
        notification_chats.is_read, 
        notification_chats.user_sender_id,
        notification_chats.user_receiver_id,
        notification_chats.conten_chat,
        user_profiles.name,
        user_profiles.image_profile[1],
        chats.chat_room_id,
        notification_chats.created_at
      FROM notification_chats
      LEFT JOIN user_profiles
      ON notification_chats.user_sender_id = user_profiles.user_id
      LEFT JOIN chats
      ON notification_chats.chat_id = chats.chat_id
      WHERE notification_chats.user_receiver_id = $1
      ORDER BY notification_chats.created_at DESC
    `;

    const result = await connectionPool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    console.error("Error fetching user notifications:", error);
  }
};

// Fetch new notifications when triggered
const emitNotifications = async (io, userId, userSocketMap) => {
  const socketId = userSocketMap.get(userId);

  if (socketId) {
    try {
      const [matchNotif, chatNotif] = await Promise.all([
        fetchMatchNotifications(userId),
        fetchChatNotifications(userId),
      ]);

      const allNotifications = [...matchNotif, ...chatNotif].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      io.to(socketId).emit("newNotifications", allNotifications);
    } catch (error) {
      console.error("Error emitting combined notifications:", error);
    }
  }
};

export const handleNotificationSocket = (io, socket, userSocketMap) => {
  // Real-time listener for new matches notifications
  supabase
    .channel("realtime:notification_matching")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notification_matching" },
      async (payload) => {
        console.log("(Supabase) New match notification detected");

        const { new: newNotification } = payload;
        const userId = newNotification.user_master_id;

        await emitNotifications(io, userId, userSocketMap);

        const socketId = userSocketMap.get(userId);
        if (socketId) {
          io.to(socketId).emit("updateMatches");
        }
      }
    )
    .subscribe();

  // Real-time listener for new chats notifications
  supabase
    .channel("realtime:notification_chats")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notification_chats" },
      async (payload) => {
        console.log("(Supabase) New chat notification detected");

        const { new: newNotification } = payload;
        const recipientId = newNotification.user_receiver_id;

        await emitNotifications(io, recipientId, userSocketMap);

        const socketId = userSocketMap.get(recipientId);
        if (socketId) {
          io.to(socketId).emit("updateChats");
        }
      }
    )
    .subscribe();

  // Fetch notifications for a user
  socket.on("fetchNotifications", async (userId) => {
    try {
      const [matchNotif, chatNotif] = await Promise.all([
        fetchMatchNotifications(userId),
        fetchChatNotifications(userId),
      ]);

      const allNotifications = [...matchNotif, ...chatNotif].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      socket.emit("newNotifications", allNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  });

  // Mark notifications as read
  socket.on("markNotificationsAsRead", async (userId) => {
    try {
      console.log(`markNotificationsAsRead Trigger for user: ${userId}`);

      // Mark matches notification
      const matchQuery = `
        UPDATE notification_matching
        SET is_read = TRUE
        WHERE user_master_id = $1 AND is_read = FALSE;
      `;

      // Mark chats notification
      const chatQuery = `
        UPDATE notification_chats
        SET is_read = TRUE
        WHERE user_receiver_id = $1 AND is_read = FALSE;
      `;

      await Promise.all([
        connectionPool.query(matchQuery, [userId]),
        connectionPool.query(chatQuery, [userId]),
      ]);

      console.log(`Notifications marked as read for user: ${userId}`);
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  });
};
