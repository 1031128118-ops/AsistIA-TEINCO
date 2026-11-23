"use strict";

const pool = require("./backend/config/database");

async function verificar() {
  try {
    const resultado = await pool.query(`
      SELECT
        con.conname AS nombre_restriccion,
        con.contype AS tipo,
        pg_get_constraintdef(con.oid) AS definicion
      FROM pg_constraint con
      INNER JOIN pg_class tabla
        ON tabla.oid = con.conrelid
      INNER JOIN pg_namespace esquema
        ON esquema.oid = tabla.relnamespace
      WHERE tabla.relname = 'documentos'
        AND esquema.nspname = 'public'
      ORDER BY con.contype, con.conname;
    `);

    console.log("\n=== RESTRICCIONES DE DOCUMENTOS ===\n");
    console.table(resultado.rows);

    const columnas = await pool.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'documentos'
      ORDER BY ordinal_position;
    `);

    console.log("\n=== COLUMNAS DE DOCUMENTOS ===\n");
    console.table(columnas.rows);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await pool.end();
  }
}

verificar();
