import mongoose from "mongoose";

let connectionPromise;

export const connectDB = async () => {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (!process.env.DB_URL) {
        throw new Error("DB_URL is not configured");
    }

    if (!connectionPromise) {
        connectionPromise = mongoose
            .connect(process.env.DB_URL)
            .then((conn) => {
                console.log(`MongoDB connected: ${conn.connection.host}`);
                return conn.connection;
            })
            .catch((error) => {
                connectionPromise = undefined;
                throw error;
            });
    }

    return connectionPromise;
};