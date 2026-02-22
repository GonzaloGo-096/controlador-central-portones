const path = require("path");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

if (!process.env.DATABASE_URL && !process.env.RAILWAY_PUBLIC_DOMAIN) {
  require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está configurada para Prisma.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

module.exports = {
  prisma,
};
