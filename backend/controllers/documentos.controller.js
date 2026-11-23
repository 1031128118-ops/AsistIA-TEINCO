/* =========================================================
   ASISTIA — TEINCO
   CONTROLADOR DE DOCUMENTOS
   Listar, registrar y descargar documentos
   Almacenamiento persistente en Supabase Storage
========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");

const pool = require("../config/database");
const supabase = require("../config/supabase");

const documentosService = require("../services/documentos.service");
const groqService = require("../services/groq.service");

const CARPETA_DOCUMENTOS = path.resolve(__dirname, "../../uploads/documentos");

const BUCKET_DOCUMENTOS =
  process.env.SUPABASE_BUCKET_DOCUMENTOS || "documentos";

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
      data: { documentos },
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
  let rutaStorage = null;
  let archivoSubidoStorage = false;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Debes seleccionar un documento.",
      });
    }

    archivoGuardado = req.file.path;

    // 1. Extraer el contenido del documento.
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

    // 5. Preparar y subir el archivo a Supabase Storage.
    rutaStorage = path.posix.join("documentos", req.file.filename);

    const buffer = await fs.promises.readFile(archivoGuardado);

    const tiposContenido = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
    };

    const { error: errorStorage } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .upload(rutaStorage, buffer, {
        contentType:
          tiposContenido[extension.toLowerCase()] || "application/octet-stream",
        upsert: false,
      });

    if (errorStorage) {
      throw new Error(
        `No fue posible guardar el documento en Supabase: ${errorStorage.message}`,
      );
    }

    archivoSubidoStorage = true;

    // 6. Registrar el documento en PostgreSQL.
    const resultado = await pool.query(
      `INSERT INTO documentos
        (
          division_id,
          nombre,
          nombre_archivo,
          ruta_archivo,
          storage_path,
          formato,
          tamano,
          activo,
          estado_clasificacion
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
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
        rutaStorage,
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

    // Eliminar el archivo remoto si falló el registro.
    if (archivoSubidoStorage && rutaStorage) {
      try {
        const { error: errorEliminar } = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
          .remove([rutaStorage]);

        if (errorEliminar) {
          console.error(
            "No se pudo eliminar el archivo de Supabase:",
            errorEliminar.message,
          );
        }
      } catch (errorStorage) {
        console.error("Error al limpiar Supabase:", errorStorage.message);
      }
    }

    // Limpiar el archivo local temporal.
    if (archivoGuardado) {
      try {
        await fs.promises.unlink(archivoGuardado);
      } catch (errorArchivo) {
        if (errorArchivo.code !== "ENOENT") {
          console.error(
            "No se pudo eliminar el archivo local:",
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
      `SELECT nombre, ruta_archivo, storage_path, formato
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

    // 1. Priorizar descarga desde Supabase Storage.
    if (documento.storage_path) {
      const { data, error } = await supabase.storage
        .from(BUCKET_DOCUMENTOS)
        .download(documento.storage_path);

      if (!error && data) {
        const buffer = Buffer.from(await data.arrayBuffer());

        const tiposContenido = {
          pdf: "application/pdf",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          txt: "text/plain; charset=utf-8",
        };

        const formato = String(documento.formato || "")
          .replace(/^\./, "")
          .toLowerCase();

        const nombreSeguro = String(documento.nombre || "documento").replace(
          /[\r\n"]/g,
          "",
        );

        res.setHeader(
          "Content-Type",
          tiposContenido[formato] || "application/octet-stream",
        );

        res.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(nombreSeguro)}`,
        );

        return res.send(buffer);
      }

      console.error(
        "Error al descargar desde Supabase:",
        error?.message || "Archivo no disponible.",
      );
    }

    // 2. Respaldo: intentar descarga local.
    if (!documento.ruta_archivo) {
      return res.status(404).json({
        success: false,
        message: "No se encontró el archivo solicitado.",
      });
    }

    const rutaArchivo = path.resolve(
      __dirname,
      "../../",
      documento.ruta_archivo,
    );

    const rutaPermitida = path.resolve(CARPETA_DOCUMENTOS);

    const rutaRelativa = path.relative(rutaPermitida, rutaArchivo);

    if (
      !rutaRelativa ||
      rutaRelativa.startsWith("..") ||
      path.isAbsolute(rutaRelativa) ||
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

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "No fue posible descargar el documento.",
      });
    }
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
