import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

export function connectDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("Set DATABASE_URL for the API database.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
