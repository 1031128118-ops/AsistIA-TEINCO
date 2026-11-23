"use strict";

const pool = require("./backend/config/database");

async function actualizarDocumentos() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Permitir documentos sin división asignada.
    await client.query(`
            ALTER TABLE documentos
            ALTER COLUMN division_id DROP NOT NULL;
        `);

    // Crear la columna si todavía no existe.
    await client.query(`
            ALTER TABLE documentos
            ADD COLUMN IF NOT EXISTS estado_clasificacion
            VARCHAR(20) NOT NULL DEFAULT 'clasificado';
        `);

    // Crear las restricciones si todavía no existen.
    await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'documentos_estado_clasificacion_check'
                ) THEN
                    ALTER TABLE documentos
                    ADD CONSTRAINT documentos_estado_clasificacion_check
                    CHECK (
                        estado_clasificacion IN (
                            'clasificado',
                            'transversal',
                            'pendiente'
                        )
                    );
                END IF;

                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'documentos_clasificacion_division_check'
                ) THEN
                    ALTER TABLE documentos
                    ADD CONSTRAINT documentos_clasificacion_division_check
                    CHECK (
                        (
                            estado_clasificacion = 'clasificado'
                            AND division_id IS NOT NULL
                        )
                        OR
                        (
                            estado_clasificacion IN ('transversal', 'pendiente')
                            AND division_id IS NULL
                        )
                    );
                END IF;
            END
            $$;
        `);

    await client.query("COMMIT");

    console.log("\n==================================");
    console.log("ACTUALIZACIÓN COMPLETADA");
    console.log("==================================");
    console.log("division_id: ahora permite NULL");
    console.log("estado_clasificacion: creada/verificada");
    console.log("Restricciones: creadas/verificadas");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al actualizar:", error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

actualizarDocumentos();
