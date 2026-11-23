/* =========================================================
   ASISTIA — TEINCO
   CONTROLADOR DE DIVISIONES
   Listar, crear y actualizar divisiones
========================================================= */

"use strict";

const pool = require("../config/database");

// =========================================================
// FUNCIONES AUXILIARES
// =========================================================

function generarId(nombre) {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function interpretarEstado(valor, predeterminado = true) {
  if (valor === undefined || valor === null || valor === "") {
    return predeterminado;
  }

  if (typeof valor === "boolean") {
    return valor;
  }

  return ["true", "1", "activa", "activo", "active"].includes(
    String(valor).toLowerCase(),
  );
}

function responderError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  });
}

// =========================================================
// LISTAR DIVISIONES
// GET /api/admin/divisiones
// =========================================================

async function listarDivisiones(req, res) {
  try {
    const resultado = await pool.query(`
      SELECT
        d.id,
        d.nombre,
        d.descripcion,
        d.activa,
        d.fecha_creacion,

        (
          SELECT COUNT(*)::INTEGER
          FROM conversaciones c
          WHERE c.division_id = d.id
        ) AS consultas,

        (
          SELECT COUNT(*)::INTEGER
          FROM documentos doc
          WHERE doc.division_id = d.id
            AND doc.activo = TRUE
        ) AS documentos

      FROM divisiones d
      ORDER BY d.nombre ASC
    `);

    const divisiones = resultado.rows.map((division) => ({
      id: division.id,
      nombre: division.nombre,
      descripcion: division.descripcion || "",
      activa: division.activa,
      estado: division.activa ? "activa" : "inactiva",
      consultas: division.consultas,
      documentos: division.documentos,
      fechaCreacion: division.fecha_creacion,
    }));

    return res.status(200).json({
      success: true,
      data: {
        divisiones,
      },
    });
  } catch (error) {
    console.error("Error al listar divisiones:", error);

    return responderError(res, 500, "No fue posible consultar las divisiones.");
  }
}

// =========================================================
// CREAR DIVISIÓN
// POST /api/admin/divisiones
// =========================================================

async function crearDivision(req, res) {
  try {
    const nombre = String(req.body.nombre || req.body.name || "").trim();

    const descripcion = String(
      req.body.descripcion || req.body.description || "",
    ).trim();

    if (!nombre) {
      return responderError(
        res,
        400,
        "El nombre de la división es obligatorio.",
      );
    }

    if (nombre.length > 120) {
      return responderError(
        res,
        400,
        "El nombre no puede superar los 120 caracteres.",
      );
    }

    const id = generarId(nombre);

    if (!id) {
      return responderError(
        res,
        400,
        "El nombre no permite generar un identificador válido.",
      );
    }

    const activa = interpretarEstado(req.body.estado ?? req.body.activa, true);

    const resultado = await pool.query(
      `INSERT INTO divisiones
        (id, nombre, descripcion, activa)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, descripcion, activa, fecha_creacion`,
      [id, nombre, descripcion, activa],
    );

    const division = resultado.rows[0];

    return res.status(201).json({
      success: true,
      message: "División creada correctamente.",
      data: {
        division: {
          ...division,
          estado: division.activa ? "activa" : "inactiva",
          consultas: 0,
          documentos: 0,
        },
      },
    });
  } catch (error) {
    console.error("Error al crear división:", error);

    if (error.code === "23505") {
      return responderError(
        res,
        409,
        "Ya existe una división con ese identificador o nombre.",
      );
    }

    return responderError(res, 500, "No fue posible crear la división.");
  }
}

// =========================================================
// ACTUALIZAR DIVISIÓN
// PUT /api/admin/divisiones/:id
// =========================================================

async function actualizarDivision(req, res) {
  try {
    const { id } = req.params;

    const nombre = String(req.body.nombre || req.body.name || "").trim();

    const descripcion = String(
      req.body.descripcion || req.body.description || "",
    ).trim();

    if (!nombre) {
      return responderError(
        res,
        400,
        "El nombre de la división es obligatorio.",
      );
    }

    if (nombre.length > 120) {
      return responderError(
        res,
        400,
        "El nombre no puede superar los 120 caracteres.",
      );
    }

    const estadoRecibido = req.body.estado ?? req.body.activa;

    const activa =
      estadoRecibido === undefined ? null : interpretarEstado(estadoRecibido);

    const resultado = await pool.query(
      `UPDATE divisiones
       SET nombre = $1,
           descripcion = $2,
           activa = COALESCE($3, activa)
       WHERE id = $4
       RETURNING id, nombre, descripcion, activa, fecha_creacion`,
      [nombre, descripcion, activa, id],
    );

    if (resultado.rowCount === 0) {
      return responderError(
        res,
        404,
        "La división que intentas actualizar no existe.",
      );
    }

    const division = resultado.rows[0];

    return res.status(200).json({
      success: true,
      message: "División actualizada correctamente.",
      data: {
        division: {
          ...division,
          estado: division.activa ? "activa" : "inactiva",
        },
      },
    });
  } catch (error) {
    console.error("Error al actualizar división:", error);

    return responderError(res, 500, "No fue posible actualizar la división.");
  }
}

// =========================================================
// ELIMINAR DIVISIÓN
// DELETE /api/admin/divisiones/:id
// =========================================================

async function eliminarDivision(req, res) {
  const { id } = req.params;

  if (!id) {
    return responderError(
      res,
      400,
      "Debes indicar la división que deseas eliminar.",
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Buscar y bloquear la división durante la operación.
    const resultado = await client.query(
      `SELECT id, nombre
       FROM divisiones
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (resultado.rowCount === 0) {
      await client.query("ROLLBACK");

      return responderError(
        res,
        404,
        "La división que intentas eliminar no existe.",
      );
    }

    const division = resultado.rows[0];

    // Comprobar todas las consultas y documentos asociados.
    const asociaciones = await client.query(
      `SELECT
        (
          SELECT COUNT(*)
          FROM conversaciones
          WHERE division_id = $1
        )::INTEGER AS consultas,

        (
          SELECT COUNT(*)
          FROM documentos
          WHERE division_id = $1
        )::INTEGER AS documentos`,
      [id],
    );

    const consultas = asociaciones.rows[0].consultas;
    const documentos = asociaciones.rows[0].documentos;

    // Proteger el historial institucional.
    if (consultas > 0 || documentos > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "No se puede eliminar esta división porque tiene información asociada. Puedes desactivarla para conservar su historial.",
        data: {
          division: division.nombre,
          consultas,
          documentos,
        },
      });
    }

    // Eliminar únicamente si no tiene registros asociados.
    await client.query("DELETE FROM divisiones WHERE id = $1", [id]);

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: `La división ${division.nombre} fue eliminada correctamente.`,
      data: {
        id: division.id,
        nombre: division.nombre,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error al eliminar división:", error);

    if (error.code === "23503") {
      return responderError(
        res,
        409,
        "No se puede eliminar la división porque tiene registros relacionados.",
      );
    }

    return responderError(res, 500, "No fue posible eliminar la división.");
  } finally {
    client.release();
  }
}

// =========================================================
// LISTAR DIVISIONES PÚBLICAS
// GET /api/divisiones
// Solo devuelve divisiones activas.
// =========================================================

async function listarDivisionesPublicas(req, res) {
  try {
    const resultado = await pool.query(`
      SELECT
        id,
        nombre,
        descripcion
      FROM divisiones
      WHERE activa = TRUE
      ORDER BY nombre ASC
    `);

    return res.status(200).json({
      success: true,
      data: {
        divisiones: resultado.rows,
      },
    });
  } catch (error) {
    console.error("Error al listar divisiones públicas:", error);

    return responderError(
      res,
      500,
      "No fue posible consultar las divisiones institucionales.",
    );
  }
}

// =========================================================
// EXPORTACIONES
// =========================================================

module.exports = {
  listarDivisiones,
  listarDivisionesPublicas,
  crearDivision,
  actualizarDivision,
  eliminarDivision,
};
