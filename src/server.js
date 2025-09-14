import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import taskRouters from "./routes/tasksRouter.js";
import cors from "cors";
import { requireAuth } from "@clerk/express";
import serverless from "serverless-http";

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use(express.json());
app.use(cors({ origin: FRONTEND_URL }));

app.use("/api/tasks", requireAuth(), taskRouters);

// Kết nối DB
connectDB();

export default serverless(app);