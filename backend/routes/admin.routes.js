/* =========================================================
   ASISTIA — TEINCO
   RUTAS ADMINISTRATIVAS
   Divisiones y gestión de documentos
========================================================= */

"use strict";

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const router = express.Router();

const divisionesController = require("../controllers/divisiones.controller");
const documentosController = require("../controllers/documentos.controller");

// =========================================================
// PROTECCIÓN ADMINISTRATIVA
// =========================================================

function verificarAdministrador(req, res, next) {
  if (!req.session || !req.session.administrador) {
    return res.status(401).json({
      success: false,
      message: "No tienes autorización para acceder a este recurso.",
    });
  }

  next();
}

router.use(verificarAdministrador);

// =========================================================
// CONFIGURACIÓN DE ALMACENAMIENTO
// =========================================================

const carpetaDocumentos = path.resolve(__dirname, "../../uploads/documentos");

fs.mkdirSync(carpetaDocumentos, { recursive: true });

const almacenamiento = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, carpetaDocumentos);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const nombreSeguro = `${crypto.randomUUID()}${extension}`;

    callback(null, nombreSeguro);
  },
});

// =========================================================
// VALIDACIÓN DE ARCHIVOS
// =========================================================

const extensionesPermitidas = [".pdf", ".docx", ".txt"];

const subirArchivo = multer({
  storage: almacenamiento,

  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!extensionesPermitidas.includes(extension)) {
      return callback(
        new Error("Formato no permitido. Utiliza PDF, DOC, DOCX o TXT."),
      );
    }

    callback(null, true);
  },
});

// =========================================================
// RUTAS DE DIVISIONES
// =========================================================
// =========================================================
// RUTAS DE DIVISIONES
// =========================================================

router.get("/divisiones", divisionesController.listarDivisiones);

router.post("/divisiones", divisionesController.crearDivision);

router.put("/divisiones/:id", divisionesController.actualizarDivision);

router.delete("/divisiones/:id", divisionesController.eliminarDivision);

// =========================================================
// RUTAS DE DOCUMENTOS
// ===
// ======================================================

router.get("/documentos", documentosController.listarDocumentos);

router.post(
  "/documentos",
  subirArchivo.single("documento"),
  documentosController.subirDocumento,
);

router.get(
  "/documentos/:id/descargar",
  documentosController.descargarDocumento,
);

// =========================================================
// ERRORES DE SUBIDA
// =========================================================

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const mensaje =
      error.code === "LIMIT_FILE_SIZE"
        ? "El archivo supera el límite permitido de 20 MB."
        : "No fue posible procesar el archivo.";

    return res.status(400).json({
      success: false,
      message: mensaje,
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Error al subir el documento.",
    });
  }

  next();
});

// =========================================================
// EXPORTACIÓN
// =========================================================

module.exports = router;
