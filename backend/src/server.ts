import { createApp } from "./app";
import { env } from "./config/env";
import { initTelegramBot } from "./modules/telegram/bot";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✅ Campus Super App Backend running on http://localhost:${env.PORT}`);
  console.log(`📡 Environment: ${env.NODE_ENV} | API Version: ${env.API_PREFIX}`);

  // Initialize Telegram Bot service if configured
  initTelegramBot();
});

// Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
});

export default server;
