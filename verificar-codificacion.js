"use strict";

const pool = require("./backend/config/database");

async function verificar() {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        encode(convert_to(nombre, 'UTF8'), 'hex') AS nombre_hex,
        encode(convert_to(descripcion, 'UTF8'), 'hex') AS descripcion_hex
      FROM divisiones
      ORDER BY nombre
    `);

    console.table(resultado.rows);
  } catch (error) {
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

verificar();
