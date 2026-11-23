const pool = require("./backend/config/database");

async function ejecutar() {
  try {
    const resultado = await pool.query(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'documentos'
      ORDER BY ordinal_position
    `);

    console.table(resultado.rows);
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

ejecutar();