
const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

const TABLAS = [
    "divisiones",
    "administradores",
    "conversaciones",
    "documentos"
];

const SECUENCIAS = [
    "administradores_id_seq",
    "conversaciones_id_seq",
    "documentos_id_seq"
];

async function generarRespaldo() {
    const respaldo = {
        aplicacion: "AsistIA - TEINCO",
        fecha: new Date().toISOString(),
        baseDatos: "asistia_teinco",
        tablas: {},
        secuencias: {},
        restricciones: {},
        indices: {}
    };

    try {
        console.log("\nIniciando respaldo de AsistIA...\n");

        // Exportar estructura y registros.
        for (const tabla of TABLAS) {
            console.log(`Exportando tabla: ${tabla}`);

            const columnas = await pool.query(`
                SELECT
                    a.attname AS nombre,
                    format_type(a.atttypid, a.atttypmod) AS tipo,
                    a.attnotnull AS obligatorio,
                    pg_get_expr(d.adbin, d.adrelid) AS valor_default
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_attrdef d
                    ON d.adrelid = a.attrelid
                    AND d.adnum = a.attnum
                WHERE n.nspname = 'public'
                    AND c.relname = $1
                    AND a.attnum > 0
                    AND NOT a.attisdropped
                ORDER BY a.attnum;
            `, [tabla]);

            const datos = await pool.query(
                `SELECT * FROM public."${tabla}"`
            );

            respaldo.tablas[tabla] = {
                columnas: columnas.rows,
                registros: datos.rows
            };
        }

        // Exportar restricciones.
        const restricciones = await pool.query(`
            SELECT
                t.relname AS tabla,
                c.conname AS nombre,
                c.contype AS tipo,
                pg_get_constraintdef(c.oid) AS definicion
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
                AND t.relname = ANY($1)
            ORDER BY t.relname, c.conname;
        `, [TABLAS]);

        respaldo.restricciones = restricciones.rows;

        // Exportar índices secundarios.
        const indices = await pool.query(`
            SELECT
                t.relname AS tabla,
                i.indexrelid::regclass::text AS nombre,
                pg_get_indexdef(i.indexrelid) AS definicion
            FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
                AND t.relname = ANY($1)
                AND NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint c
                    WHERE c.conindid = i.indexrelid
                )
            ORDER BY t.relname;
        `, [TABLAS]);

        respaldo.indices = indices.rows;

        // Exportar secuencias.
        for (const secuencia of SECUENCIAS) {
            const configuracion = await pool.query(`
                SELECT *
                FROM pg_sequences
                WHERE schemaname = 'public'
                    AND sequencename = $1;
            `, [secuencia]);

            const valores = await pool.query(
                `SELECT last_value, is_called FROM public."${secuencia}"`
            );

            respaldo.secuencias[secuencia] = {
                configuracion: configuracion.rows[0],
                estado: valores.rows[0]
            };
        }

        // Guardar archivo JSON.
        const carpeta = path.resolve(__dirname, "../../backups");

        fs.mkdirSync(carpeta, { recursive: true });

        const nombre = `respaldo-asistia-${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")}.json`;

        const destino = path.join(carpeta, nombre);

        fs.writeFileSync(
            destino,
            JSON.stringify(respaldo, null, 2),
            "utf8"
        );

        console.log("\n¡Respaldo generado correctamente!");
        console.log(`Archivo: ${destino}`);

        for (const tabla of TABLAS) {
            console.log(
                `${tabla}: ${respaldo.tablas[tabla].registros.length} registros`
            );
        }

        console.log("\nLas sesiones no fueron exportadas.");
        console.log("La base de datos original no fue modificada.\n");

    } catch (error) {
        console.error("\nError al generar el respaldo:");
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

generarRespaldo();
