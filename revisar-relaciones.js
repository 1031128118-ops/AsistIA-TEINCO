const pool = require("./backend/config/database");

async function revisarRelaciones() {
    try {
        const resultado = await pool.query(`
            SELECT
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS tabla_referenciada,
                ccu.column_name AS columna_referenciada,
                tc.constraint_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.constraint_schema = kcu.constraint_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.constraint_schema = tc.constraint_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public'
            ORDER BY tc.table_name;
        `);

        console.table(resultado.rows);
    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await pool.end();
    }
}

revisarRelaciones();
