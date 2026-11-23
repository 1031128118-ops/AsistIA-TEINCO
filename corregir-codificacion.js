"use strict";

const pool = require("./backend/config/database");

async function corregirCodificacion() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      UPDATE divisiones
      SET descripcion = $1
      WHERE id = 'bienestar'
    `, [
      "Información sobre servicios y programas de bienestar."
    ]);

    await client.query(`
      UPDATE divisiones
      SET
        nombre = $1,
        descripcion = $2
      WHERE id = 'academica'
    `, [
      "Coordinación Académica",
      "Información sobre procesos y coordinación académica."
    ]);

    await client.query(`
      UPDATE divisiones
      SET descripcion = $1
      WHERE id = 'registro'
    `, [
      "Información sobre registros y procesos académicos."
    ]);

    await client.query("COMMIT");

    console.log("");
    console.log("========================================");
    console.log(" CORRECCIÓN COMPLETADA");
    console.log("========================================");
    console.log("Se corrigieron los textos afectados.");
    console.log("Los identificadores se conservaron.");
    console.log("");

    const resultado = await client.query(`
      SELECT id, nombre, descripcion
      FROM divisiones
      ORDER BY nombre
    `);

    console.table(resultado.rows);

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("No se pudo completar la corrección:", error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

corregirCodificacion();
