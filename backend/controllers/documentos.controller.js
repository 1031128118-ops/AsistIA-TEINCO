/* =========================================================
   ASISTIA — TEINCO
   CONTROLADOR DE DOCUMENTOS
   Listar, registrar y descargar documentos
========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");
const pool = require("../config/database");
const documentosService = require("../services/documentos.service");
const groqService = require("../services/groq.service");

const CARPETA_DOCUMENTOS = path.resolve(__dirname, "../../uploads/documentos");

// =========================================================
// LISTAR DOCUMENTOS
// GET /api/admin/documentos
// =========================================================

async function listarDocumentos(req, res) {
  try {
    const resultado = await pool.query(`
      SELECT
        doc.id,
        doc.nombre,
        doc.nombre_archivo,
        doc.formato,
        doc.tamano,
        doc.fecha_registro,
        doc.division_id,
        doc.estado_clasificacion,
        d.nombre AS division_nombre
      FROM documentos doc
      LEFT JOIN divisiones d
        ON d.id = doc.division_id
      WHERE doc.activo = TRUE
      ORDER BY doc.fecha_registro DESC
    `);

    const documentos = resultado.rows.map((doc) => ({
      id: doc.id,
      nombre: doc.nombre,
      divisionId: doc.division_id,
      divisionNombre: doc.division_nombre,
      division: doc.division_nombre,
      estadoClasificacion: doc.estado_clasificacion,
      formato: doc.formato,
      tamano: Number(doc.tamano),
      fechaRegistro: doc.fecha_registro,
      fecha: doc.fecha_registro,
      url: `/api/admin/documentos/${doc.id}/descargar`,
    }));

    return res.status(200).json({
      success: true,
      data: {
        documentos,
      },
    });
  } catch (error) {
    console.error("Error al listar documentos:", error);

    return res.status(500).json({
      success: false,
      message: "No fue posible consultar los documentos.",
    });
  }
}

// =========================================================
// SUBIR Y REGISTRAR DOCUMENTO
// POST /api/admin/documentos
// =========================================================

async function subirDocumento(req, res) {
  let archivoGuardado = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Debes seleccionar un documento.",
      });
    }

    archivoGuardado = req.file.path;

    // 1. Extraer el texto del documento.
    const contenido =
      await documentosService.extraerTextoDocumento(archivoGuardado);

    if (!contenido || contenido.trim().length < 50) {
      throw new Error(
        "El documento no contiene suficiente texto para clasificarlo.",
      );
    }

    // 2. Consultar las divisiones activas.
    const divisionResultado = await pool.query(`
      SELECT id, nombre
      FROM divisiones
      WHERE activa = TRUE
      ORDER BY nombre ASC
    `);

    if (divisionResultado.rowCount === 0) {
      throw new Error("No hay divisiones institucionales activas.");
    }

    // 3. Clasificar automáticamente con Groq.
    const clasificacion = await groqService.clasificarDocumento({
      nombre: req.file.originalname,
      contenido,
      divisiones: divisionResultado.rows,
    });

    const divisionId =
      clasificacion.estadoClasificacion === "clasificado"
        ? clasificacion.divisionId
        : null;

    // 4. Preparar los datos del archivo.
    const nombreOriginal = path
      .basename(req.file.originalname)
      .replace(/[\r\n]/g, "")
      .slice(0, 250);

    const extension = path
      .extname(nombreOriginal)
      .replace(".", "")
      .toUpperCase();

    const rutaRelativa = path.posix.join(
      "uploads",
      "documentos",
      req.file.filename,
    );

    // 5. Guardar el documento y su clasificación.
    const resultado = await pool.query(
      `INSERT INTO documentos
        (
          division_id,
          nombre,
          nombre_archivo,
          ruta_archivo,
          formato,
          tamano,
          activo,
          estado_clasificacion
        )
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
       RETURNING
         id,
         division_id,
         nombre,
         nombre_archivo,
         formato,
         tamano,
         fecha_registro,
         estado_clasificacion`,
      [
        divisionId,
        nombreOriginal,
        req.file.filename,
        rutaRelativa,
        extension,
        req.file.size,
        clasificacion.estadoClasificacion,
      ],
    );

    const documento = resultado.rows[0];

    const division = divisionResultado.rows.find(
      (d) => d.id === documento.division_id,
    );

    return res.status(201).json({
      success: true,
      message: "Documento cargado y procesado correctamente.",
      data: {
        documento: {
          id: documento.id,
          nombre: documento.nombre,
          divisionId: documento.division_id,
          divisionNombre: division?.nombre || null,
          division: division?.nombre || null,
          estadoClasificacion: documento.estado_clasificacion,
          motivoClasificacion: clasificacion.motivo,
          formato: documento.formato,
          tamano: Number(documento.tamano),
          fechaRegistro: documento.fecha_registro,
          fecha: documento.fecha_registro,
          url: `/api/admin/documentos/${documento.id}/descargar`,
        },
      },
    });
  } catch (error) {
    console.error("Error al subir documento:", error);

    if (archivoGuardado) {
      try {
        await fs.promises.unlink(archivoGuardado);
      } catch (errorArchivo) {
        if (errorArchivo.code !== "ENOENT") {
          console.error(
            "No se pudo eliminar el archivo:",
            errorArchivo.message,
          );
        }
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "No fue posible guardar el documento.",
    });
  }
}

// =========================================================
// DESCARGAR DOCUMENTO
// GET /api/admin/documentos/:id/descargar
// =========================================================

async function descargarDocumento(req, res) {
  try {
    const { id } = req.params;

    const resultado = await pool.query(
      `SELECT nombre, ruta_archivo
       FROM documentos
       WHERE id = $1 AND activo = TRUE`,
      [id],
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "El documento no existe o no está disponible.",
      });
    }

    const documento = resultado.rows[0];

    const rutaArchivo = path.resolve(
      __dirname,
      "../../",
      documento.ruta_archivo,
    );

    const rutaPermitida = path.resolve(CARPETA_DOCUMENTOS);

    if (
      !rutaArchivo.startsWith(rutaPermitida + path.sep) ||
      !fs.existsSync(rutaArchivo)
    ) {
      return res.status(404).json({
        success: false,
        message: "No se encontró el archivo solicitado.",
      });
    }

    return res.download(rutaArchivo, documento.nombre);
  } catch (error) {
    console.error("Error al descargar documento:", error);

    return res.status(500).json({
      success: false,
      message: "No fue posible descargar el documento.",
    });
  }
}

// =========================================================
// EXPORTACIONES
// =========================================================

module.exports = {
  listarDocumentos,
  subirDocumento,
  descargarDocumento,
};
