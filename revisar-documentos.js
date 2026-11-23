const pool = require("./backend/config/database");

async function revisarDocumentos() {
    try {
        const resultado = await pool.query(`
            SELECT
                id,
                nombre,
                nombre_archivo,
                ruta_archivo,
                formato,
                tamano,
                activo
            FROM documentos
            ORDER BY id;
        `);

        console.table(resultado.rows);
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await pool.end();
    }
}

revisarDocumentos();
