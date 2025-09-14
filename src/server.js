import { requireAuth } from "@clerk/express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import taskRouters from "./routes/tasksRouter.js";
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

export default serverless(app);