const pool = require("./backend/config/database");

async function revisarTablas() {
    try {
        const resultado = await pool.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        `);

        console.table(resultado.rows);
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await pool.end();
    }
}

revisarTablas();
