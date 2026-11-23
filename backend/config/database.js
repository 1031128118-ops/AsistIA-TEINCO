
"use strict";

const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const { Pool } = require("pg");

const usarSupabase =
  process.env.NODE_ENV === "production" ||
  process.env.DB_PROVIDER === "supabase";

let pool;

if (usarSupabase) {
  if (!process.env.SUPABASE_DATABASE_URL) {
    throw new Error(
      "Falta SUPABASE_DATABASE_URL en el archivo .env.",
    );
  }

  pool = new Pool({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  console.log("Base de datos seleccionada: Supabase PostgreSQL");
} else {
  const variablesRequeridas = [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
  ];

  for (const variable of variablesRequeridas) {
    if (!process.env[variable]) {
      throw new Error(
        `Falta configurar la variable ${variable} en el archivo .env`,
      );
    }
  }

  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  console.log("Base de datos seleccionada: PostgreSQL local");
}

pool.on("error", (error) => {
  console.error(
    "Error inesperado en PostgreSQL:",
    error.message,
  );
});

module.exports = pool;
