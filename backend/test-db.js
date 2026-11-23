/* =========================================================
   ASISTIA — TEINCO
   PRUEBA DE CONEXIÓN CON POSTGRESQL
========================================================= */

"use strict";

const pool = require("./config/database");

async function probarConexion() {
  try {
    console.log("");
    console.log("==================================");
    console.log(" ASISTIA — PRUEBA DE POSTGRESQL");
    console.log("==================================");

    const resultado = await pool.query(`
      SELECT
        current_database() AS base_datos,
        current_user AS usuario,
        version() AS version_postgresql,
        NOW() AS fecha_servidor
    `);

    const datos = resultado.rows[0];

    console.log("CONEXIÓN EXITOSA");
    console.log("Base de datos:", datos.base_datos);
    console.log("Usuario:", datos.usuario);
    console.log("Versión:", datos.version_postgresql);
    console.log("Fecha:", datos.fecha_servidor);

    const divisiones = await pool.query(`
      SELECT id, nombre, activa
      FROM divisiones
      ORDER BY nombre
    `);

    console.log("");
    console.log("DIVISIONES REGISTRADAS:");

    divisiones.rows.forEach((division) => {
      console.log(`- ${division.nombre} (${division.id})`);
    });

    console.log("");
    console.log("ASISTIA ESTÁ CONECTADA A POSTGRESQL.");
  } catch (error) {
    console.error("");
    console.error("ERROR DE CONEXIÓN:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

probarConexion();
