import express from "express";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";

const router = express.Router();

router.get("/db", async (req, res) => {
	try {
		await connectDB();

		if (mongoose.connection.readyState !== 1) {
			return res.status(503).json({
				status: "error",
				database: "disconnected",
			});
		}

		if (!mongoose.connection.db) {
			return res.status(503).json({
				status: "error",
				database: "disconnected",
			});
		}

		await mongoose.connection.db.command({ ping: 1 });

		res.status(200).json({
			status: "ok",
			database: "connected",
		});
	} catch (error) {
		res.status(503).json({
			status: "error",
			database: "disconnected",
		});
	}
});

export default router;
