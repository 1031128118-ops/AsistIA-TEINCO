const pool = require("./backend/config/database");

async function revisarIndices() {
    try {
        const resultado = await pool.query(`
            SELECT
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname;
        `);

        console.table(resultado.rows);
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await pool.end();
    }
}

revisarIndices();
