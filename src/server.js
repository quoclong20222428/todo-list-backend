import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { requireAuth } from "@clerk/express";
import taskRouters from "./routes/tasksRouter.js";
import { connectDB } from "./config/db.js";
import serverless from "serverless-http";

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(express.json());
app.use(cors({ origin: FRONTEND_URL }));

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/tasks", requireAuth(), taskRouters);

// kết nối DB khi khởi tạo, không block request
connectDB().catch(err => {
  console.error("MongoDB connection failed:", err.message);
});

export default serverless(app);
