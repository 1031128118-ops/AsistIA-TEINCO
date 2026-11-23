const pool = require("./backend/config/database");

async function revisarDatos() {
    try {
        const consultas = await pool.query(`
            SELECT
                'Divisiones' AS tabla,
                COUNT(*) AS total
            FROM divisiones

            UNION ALL

            SELECT
                'Divisiones activas',
                COUNT(*)
            FROM divisiones
            WHERE activa = TRUE

            UNION ALL

            SELECT
                'Documentos',
                COUNT(*)
            FROM documentos

            UNION ALL

            SELECT
                'Documentos activos',
                COUNT(*)
            FROM documentos
            WHERE activo = TRUE

            UNION ALL

            SELECT
                'Conversaciones',
                COUNT(*)
            FROM conversaciones;
        `);

        console.table(consultas.rows);

        const divisiones = await pool.query(`
            SELECT
                d.nombre,
                d.activa,
                COUNT(DISTINCT c.id) AS conversaciones,
                COUNT(DISTINCT doc.id) AS documentos
            FROM divisiones d
            LEFT JOIN conversaciones c ON c.division_id = d.id
            LEFT JOIN documentos doc ON doc.division_id = d.id
            GROUP BY d.id, d.nombre, d.activa
            ORDER BY d.nombre;
        `);

        console.table(divisiones.rows);

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await pool.end();
    }
}

revisarDatos();
