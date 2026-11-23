/* =========================================================
   ASISTIA — TEINCO
   SERVICIO DE CONOCIMIENTO INSTITUCIONAL

   Archivo: backend/services/conocimiento.service.js

   Funciones:
   - Consultar documentos institucionales activos.
   - Filtrar documentos por división.
   - Recuperar información relacionada con la consulta.
   - Reconocer variaciones frecuentes de palabras.
   - Priorizar documentos por relevancia.
   - Extraer texto de archivos autorizados.
   - Construir contexto para Groq.
   - Evitar el acceso a archivos fuera de la carpeta autorizada.
   - Reutilizar temporalmente el texto de documentos sin
     volver a extraerlo en cada mensaje.
========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");

const pool = require("../config/database");

const { extraerTextoDocumento } = require("./documentos.service");

// =========================================================
// CONFIGURACIÓN
// =========================================================

const CONFIG = Object.freeze({
  CARPETA_DOCUMENTOS: path.resolve(__dirname, "../../uploads/documentos"),

  MAX_CONTEXTO_TOTAL: 12000,

  MAX_CARACTERES_DOCUMENTO: 4000,

  MAX_DOCUMENTOS_RELEVANTES: 5,

  FORMATOS_PERMITIDOS: [".pdf", ".docx", ".txt"],

  PALABRAS_IGNORADAS: new Set([
    "que",
    "como",
    "cuando",
    "donde",
    "cual",
    "cuales",
    "quien",
    "quienes",
    "porque",
    "para",
    "por",
    "con",
    "sin",
    "sobre",
    "desde",
    "hasta",
    "entre",
    "hacia",
    "este",
    "esta",
    "estos",
    "estas",
    "eso",
    "esa",
    "esos",
    "esas",
    "hay",
    "ser",
    "estar",
    "tener",
    "tiene",
    "tienen",
    "puede",
    "pueden",
    "quiero",
    "quisiera",
    "saber",
    "conocer",
    "dime",
    "decir",
    "explicar",
    "explicame",
    "hola",
    "holaaa",
    "buenas",
    "dias",
    "tardes",
    "no",
    "si",
    "un",
    "una",
    "unos",
    "unas",
    "el",
    "la",
    "los",
    "las",
    "lo",
    "de",
    "del",
    "al",
    "a",
    "en",
    "y",
    "o",
    "u",
    "e",
    "mi",
    "mis",
    "tu",
    "tus",
    "me",
    "te",
    "se",
    "nos",
    "es",
    "son",
    "fue",
    "fueron",
    "muy",
    "mas",
    "menos",
    "tambien",
  ]),

  SUFIJOS: [
    "amientos",
    "imientos",
    "aciones",
    "adores",
    "adoras",
    "amiento",
    "imiento",
    "acion",
    "idades",
    "idad",
    "mente",
    "ancias",
    "encia",
    "encias",
    "ando",
    "iendo",
    "ados",
    "adas",
    "idos",
    "idas",
    "es",
    "os",
    "as",
    "s",
  ],
});

// Caché temporal en memoria.
// No guarda conversaciones ni información del usuario.
// Se invalida cuando cambia el archivo.

const cacheDocumentos = new Map();

// =========================================================
// NORMALIZAR TEXTO
// =========================================================

function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =========================================================
// NORMALIZAR VARIACIONES DE PALABRAS
// =========================================================

function normalizarTermino(palabra) {
  let termino = normalizarTexto(palabra);

  if (termino.length < 5) {
    return termino;
  }

  for (const sufijo of CONFIG.SUFIJOS) {
    if (termino.endsWith(sufijo) && termino.length - sufijo.length >= 4) {
      termino = termino.slice(0, -sufijo.length);
      break;
    }
  }

  return termino;
}

// =========================================================
// EXTRAER PALABRAS IMPORTANTES
// =========================================================

function obtenerPalabrasClave(texto) {
  const palabras = normalizarTexto(texto)
    .split(" ")
    .filter((palabra) => {
      return palabra.length >= 3 && !CONFIG.PALABRAS_IGNORADAS.has(palabra);
    })
    .map(normalizarTermino)
    .filter(Boolean);

  return [...new Set(palabras)];
}

// =========================================================
// COMPROBAR COINCIDENCIA ENTRE TÉRMINOS
// =========================================================

function coincideTermino(consulta, documento) {
  if (!consulta || !documento) {
    return false;
  }

  if (consulta === documento) {
    return true;
  }

  if (consulta.length >= 5 && documento.length >= 5) {
    const prefijoConsulta = consulta.slice(0, 5);
    const prefijoDocumento = documento.slice(0, 5);

    return prefijoConsulta === prefijoDocumento;
  }

  return false;
}

// =========================================================
// CALCULAR RELEVANCIA DE UN DOCUMENTO
// =========================================================

function calcularRelevancia(documento, palabrasConsulta) {
  if (!palabrasConsulta.length) {
    return 0;
  }

  const nombreDocumento = normalizarTexto(
    `${documento.nombre || ""} ${documento.archivo || ""} ${documento.division || ""}`,
  );

  const palabrasNombre = obtenerPalabrasClave(nombreDocumento);

  const contenidoDocumento = normalizarTexto(documento.contenido);

  const palabrasDocumento = obtenerPalabrasClave(contenidoDocumento);

  let puntuacion = 0;

  for (const palabra of palabrasConsulta) {
    const coincideContenido = palabrasDocumento.some((palabraDocumento) => {
      return coincideTermino(palabra, palabraDocumento);
    });

    const coincideNombre = palabrasNombre.some((palabraDocumento) => {
      return coincideTermino(palabra, palabraDocumento);
    });

    if (coincideContenido) {
      puntuacion += 2;
    }

    if (coincideNombre) {
      puntuacion += 5;
    }
  }

  return puntuacion;
}

// =========================================================
// VALIDAR Y RESOLVER RUTA DEL DOCUMENTO
// =========================================================

async function resolverRutaDocumento(rutaGuardada) {
  if (typeof rutaGuardada !== "string" || !rutaGuardada.trim()) {
    throw new Error("La ruta del documento no es válida.");
  }

  const rutaAbsoluta = path.resolve(__dirname, "../../", rutaGuardada);

  const carpetaReal = await fs.promises.realpath(CONFIG.CARPETA_DOCUMENTOS);

  const archivoReal = await fs.promises.realpath(rutaAbsoluta);

  const rutaRelativa = path.relative(carpetaReal, archivoReal);

  // Impide salir de la carpeta autorizada.
  if (
    !rutaRelativa ||
    rutaRelativa.startsWith("..") ||
    path.isAbsolute(rutaRelativa)
  ) {
    throw new Error("La ruta del documento no está autorizada.");
  }

  const extension = path.extname(archivoReal).toLowerCase();

  if (!CONFIG.FORMATOS_PERMITIDOS.includes(extension)) {
    throw new Error(
      "El formato del documento no está habilitado para lectura.",
    );
  }

  const informacionArchivo = await fs.promises.stat(archivoReal);

  if (!informacionArchivo.isFile()) {
    throw new Error("La ruta indicada no corresponde a un archivo.");
  }

  return {
    ruta: archivoReal,
    extension,
    fechaModificacion: informacionArchivo.mtimeMs,
    tamano: informacionArchivo.size,
  };
}

// =========================================================
// CONSULTAR DOCUMENTOS ACTIVOS
// =========================================================

async function consultarDocumentos(division) {
  try {
    const divisionSolicitada =
      typeof division === "string" && division.trim()
        ? division.trim()
        : "General";

    const resultado = await pool.query(
      `
      SELECT
        doc.id,
        doc.nombre,
        doc.nombre_archivo,
        doc.ruta_archivo,
        doc.formato,
        doc.fecha_registro,
        doc.division_id,
        doc.estado_clasificacion,
        COALESCE(
          div.nombre,
          'Institucional (transversal)'
        ) AS division_nombre
      FROM documentos doc

      LEFT JOIN divisiones div
        ON div.id = doc.division_id
        AND div.activa = TRUE

      WHERE
        doc.activo = TRUE

        AND LOWER(
          REPLACE(TRIM(doc.formato), '.', '')
        ) IN ('pdf', 'docx', 'txt')

        AND (
          -- Documentos transversales disponibles para todas las divisiones.
          doc.estado_clasificacion = 'transversal'

          OR

          -- Documentos clasificados disponibles según su división.
          (
            doc.estado_clasificacion = 'clasificado'
            AND div.id IS NOT NULL
            AND (
              $1 = 'General'
              OR LOWER(TRIM(div.nombre)) = LOWER(TRIM($1))
            )
          )
        )

      ORDER BY doc.fecha_registro DESC
      `,
      [divisionSolicitada],
    );

    return resultado.rows;
  } catch (error) {
    console.error("Error al consultar documentos institucionales:", error);

    throw error;
  }
}

// =========================================================
// EXTRAER CONTENIDO DE LOS DOCUMENTOS
// =========================================================

async function cargarContenidoDocumentos(documentos) {
  const contenidos = [];

  for (const documento of documentos) {
    try {
      const informacion = await resolverRutaDocumento(documento.ruta_archivo);

      const claveCache = `${informacion.ruta}`;

      const contenidoEnCache = cacheDocumentos.get(claveCache);

      let texto;

      const cacheValida =
        contenidoEnCache &&
        contenidoEnCache.fechaModificacion === informacion.fechaModificacion &&
        contenidoEnCache.tamano === informacion.tamano;

      if (cacheValida) {
        texto = contenidoEnCache.contenido;
      } else {
        texto = await extraerTextoDocumento(informacion.ruta);

        if (texto && texto.trim()) {
          texto = texto.slice(0, CONFIG.MAX_CARACTERES_DOCUMENTO);

          cacheDocumentos.set(claveCache, {
            fechaModificacion: informacion.fechaModificacion,
            tamano: informacion.tamano,
            contenido: texto,
          });
        }
      }

      if (!texto || !texto.trim()) {
        continue;
      }

      contenidos.push({
        nombre: documento.nombre,
        archivo: documento.nombre_archivo,
        division: documento.division_nombre,
        contenido: texto,
      });
    } catch (error) {
      console.error(
        `[ASISTIA - CONOCIMIENTO] No se pudo leer ${documento.nombre_archivo}:`,
        error.message,
      );
    }
  }

  return contenidos;
}

// =========================================================
// SELECCIONAR DOCUMENTOS RELACIONADOS CON LA PREGUNTA
// =========================================================

function seleccionarDocumentosRelevantes(contenidos, mensaje) {
  const palabrasConsulta = obtenerPalabrasClave(mensaje);

  if (!palabrasConsulta.length) {
    return [];
  }

  return contenidos
    .map((documento) => ({
      ...documento,

      relevancia: calcularRelevancia(documento, palabrasConsulta),
    }))
    .filter((documento) => documento.relevancia > 0)
    .sort((a, b) => {
      return b.relevancia - a.relevancia;
    })
    .slice(0, CONFIG.MAX_DOCUMENTOS_RELEVANTES);
}

// =========================================================
// CONSTRUIR CONTEXTO INSTITUCIONAL
// =========================================================

function construirContexto(contenidos) {
  let contexto = "";

  for (const documento of contenidos) {
    const fragmento = `
DOCUMENTO: ${documento.nombre}
ARCHIVO: ${documento.archivo}
DIVISIÓN: ${documento.division}

CONTENIDO:
${documento.contenido}

----------------------------------------
`;

    const espacioDisponible = CONFIG.MAX_CONTEXTO_TOTAL - contexto.length;

    if (fragmento.length > espacioDisponible) {
      if (espacioDisponible > 200) {
        contexto += fragmento.slice(0, espacioDisponible);
      }

      break;
    }

    contexto += fragmento;
  }

  return contexto.trim();
}

// =========================================================
// OBTENER CONOCIMIENTO INSTITUCIONAL
// =========================================================

async function obtenerContextoInstitucional(
  division = "General",
  mensaje = "",
) {
  try {
    const divisionSeleccionada =
      typeof division === "string" && division.trim()
        ? division.trim()
        : "General";

    const consulta = typeof mensaje === "string" ? mensaje.trim() : "";

    const documentos = await consultarDocumentos(divisionSeleccionada);

    if (!documentos.length) {
      return "";
    }

    const contenidos = await cargarContenidoDocumentos(documentos);

    if (!contenidos.length) {
      return "";
    }

    const relevantes = seleccionarDocumentosRelevantes(contenidos, consulta);

    return construirContexto(relevantes);
  } catch (error) {
    console.error("[ASISTIA - CONOCIMIENTO] Error:", error.message);

    throw error;
  }
}

// =========================================================
// EXPORTAR SERVICIO
// =========================================================

module.exports = {
  obtenerContextoInstitucional,
};
