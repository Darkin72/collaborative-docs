import mongoose from "mongoose";

export async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.DATABASE_URL || "", {
      dbName: "Google-Docs",
    });
    console.log("Database connected.");
  } catch (error) {
    console.log("DB connection failed. " + error);
    throw error;
  }
}
