/* =========================================================
   ASISTIA — TEINCO
   CONEXIÓN CON POSTGRESQL
========================================================= */

"use strict";

const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const { Pool } = require("pg");

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

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : false,

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error(
    "Error inesperado en el grupo de conexiones PostgreSQL:",
    error.message,
  );
});

module.exports = pool;
