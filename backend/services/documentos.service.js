
/* =========================================================
   ASISTIA — TEINCO
   SERVICIO DE LECTURA DE DOCUMENTOS

   Funciones:
   - Leer archivos PDF, DOCX y TXT locales.
   - Extraer texto desde archivos Buffer.
   - Validar formatos y tamaños.
   - Normalizar el contenido extraído.
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
// VALIDAR FORMATO
// =========================================================

function validarExtension(extension) {
  if (typeof extension !== "string") {
    throw new Error("El formato del documento no es válido.");
  }

  const formato = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  if (!CONFIG.FORMATOS_PERMITIDOS.includes(formato)) {
    throw new Error(
      "Formato no permitido. Solo se admiten PDF, DOCX y TXT.",
    );
  }

  return formato;
}

// =========================================================
// VALIDAR ARCHIVO LOCAL
// =========================================================

function validarArchivo(rutaArchivo) {
  if (typeof rutaArchivo !== "string" || !rutaArchivo.trim()) {
    throw new Error("La ruta del documento no es válida.");
  }

  return validarExtension(path.extname(rutaArchivo));
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
// NORMALIZAR TEXTO
// =========================================================

function normalizarTexto(texto) {
  texto = texto
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!texto) {
    throw new Error(
      "No se encontró texto extraíble en el documento.",
    );
  }

  if (texto.length > CONFIG.MAX_CARACTERES) {
    texto = texto.slice(0, CONFIG.MAX_CARACTERES);
  }

  return texto;
}

// =========================================================
// EXTRAER TEXTO DESDE BUFFER
// Compatible con Supabase Storage
// =========================================================

async function extraerTextoDesdeBuffer(buffer, extension) {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("El contenido del documento no es válido.");
    }

    if (buffer.length === 0) {
      throw new Error("El documento está vacío.");
    }

    if (buffer.length > CONFIG.MAX_TAMANO) {
      throw new Error(
        "El documento supera el tamaño máximo permitido.",
      );
    }

    const formato = validarExtension(extension);

    let texto = "";

    switch (formato) {
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
        throw new Error(
          "No se reconoce el formato del documento.",
        );
    }

    return normalizarTexto(texto);
  } catch (error) {
    console.error(
      "[ASISTIA - DOCUMENTOS] Error al extraer desde Buffer:",
      error.message,
    );

    throw error;
  }
}

// =========================================================
// EXTRAER TEXTO DE DOCUMENTO LOCAL
// =========================================================

async function extraerTextoDocumento(rutaArchivo) {
  try {
    const extension = validarArchivo(rutaArchivo);

    const archivo = await fs.stat(rutaArchivo);

    if (!archivo.isFile()) {
      throw new Error("La ruta no corresponde a un archivo.");
    }

    if (archivo.size > CONFIG.MAX_TAMANO) {
      throw new Error(
        "El documento supera el tamaño máximo permitido.",
      );
    }

    const buffer = await fs.readFile(rutaArchivo);

    return await extraerTextoDesdeBuffer(buffer, extension);
  } catch (error) {
    console.error(
      "[ASISTIA - DOCUMENTOS] Error de lectura:",
      error.message,
    );

    throw error;
  }
}

// =========================================================
// EXPORTAR SERVICIO
// =========================================================

module.exports = {
  extraerTextoDocumento,
  extraerTextoDesdeBuffer,
};
