/* =========================================================
   ASISTIA — TEINCO
   SERVICIO DE LECTURA DE DOCUMENTOS
   Archivo: backend/services/documentos.service.js

   Funciones:
   - Leer archivos PDF.
   - Leer documentos Word DOCX.
   - Leer archivos TXT.
   - Extraer el texto de los documentos.
   - Validar formatos permitidos.
   - Controlar errores de lectura.
========================================================= */

"use strict";

const fs = require("fs/promises");
const path = require("path");

const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

// =========================================================
// CONFIGURACIÓN
// =========================================================

const CONFIG = Object.freeze({
  FORMATOS_PERMITIDOS: [".pdf", ".docx", ".txt"],

  MAX_TAMANO: 20 * 1024 * 1024,

  MAX_CARACTERES: 500000,
});

// =========================================================
// VALIDAR ARCHIVO
// =========================================================

function validarArchivo(rutaArchivo) {
  if (typeof rutaArchivo !== "string" || !rutaArchivo.trim()) {
    throw new Error("La ruta del documento no es válida.");
  }

  const extension = path.extname(rutaArchivo).toLowerCase();

  if (!CONFIG.FORMATOS_PERMITIDOS.includes(extension)) {
    throw new Error("Formato no permitido. Solo se admiten PDF, DOCX y TXT.");
  }

  return extension;
}

// =========================================================
// EXTRAER TEXTO DE PDF
// =========================================================

async function extraerPDF(buffer) {
  const resultado = await pdfParse(buffer);

  return resultado.text || "";
}

// =========================================================
// EXTRAER TEXTO DE DOCX
// =========================================================

async function extraerDOCX(buffer) {
  const resultado = await mammoth.extractRawText({
    buffer,
  });

  return resultado.value || "";
}

// =========================================================
// EXTRAER TEXTO DE TXT
// =========================================================

async function extraerTXT(buffer) {
  return buffer.toString("utf8");
}

// =========================================================
// LEER DOCUMENTO
// =========================================================

async function extraerTextoDocumento(rutaArchivo) {
  try {
    const extension = validarArchivo(rutaArchivo);

    const archivo = await fs.stat(rutaArchivo);

    if (!archivo.isFile()) {
      throw new Error("La ruta no corresponde a un archivo.");
    }

    if (archivo.size > CONFIG.MAX_TAMANO) {
      throw new Error("El documento supera el tamaño máximo permitido.");
    }

    const buffer = await fs.readFile(rutaArchivo);

    let texto = "";

    switch (extension) {
      case ".pdf":
        texto = await extraerPDF(buffer);
        break;

      case ".docx":
        texto = await extraerDOCX(buffer);
        break;

      case ".txt":
        texto = await extraerTXT(buffer);
        break;

      default:
        throw new Error("No se reconoce el formato del documento.");
    }

    texto = texto
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!texto) {
      throw new Error("No se encontró texto extraíble en el documento.");
    }

    if (texto.length > CONFIG.MAX_CARACTERES) {
      texto = texto.slice(0, CONFIG.MAX_CARACTERES);
    }

    return texto;
  } catch (error) {
    console.error("[ASISTIA - DOCUMENTOS] Error de lectura:", error.message);

    throw error;
  }
}

// =========================================================
// EXPORTAR SERVICIO
// =========================================================

module.exports = {
  extraerTextoDocumento,
};
