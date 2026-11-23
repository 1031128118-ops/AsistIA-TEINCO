const pool = require("./backend/config/database");

async function revisarGeneral() {
    try {
        const resultado = await pool.query(`
            SELECT
                COUNT(*) AS total_general
            FROM conversaciones
            WHERE division_id IS NULL;
        `);

        console.table(resultado.rows);
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await pool.end();
    }
}

revisarGeneral();
