/* =========================================================
   ASISTIA — TEINCO
   SERVICIO DE CONOCIMIENTO INSTITUCIONAL

   Lectura de documentos desde Supabase Storage.
   Respaldo de lectura desde almacenamiento local.
========================================================= */

"use strict";

const fs = require("fs");
const path = require("path");

const pool = require("../config/database");
const supabase = require("../config/supabase");

const {
  extraerTextoDocumento,
  extraerTextoDesdeBuffer,
} = require("./documentos.service");

// =========================================================
// CONFIGURACIÓN
// =========================================================

const CONFIG = Object.freeze({
  CARPETA_DOCUMENTOS: path.resolve(__dirname, "../../uploads/documentos"),

  BUCKET_DOCUMENTOS: process.env.SUPABASE_BUCKET_DOCUMENTOS || "documentos",

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

// Caché temporal de documentos.
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
    return consulta.slice(0, 5) === documento.slice(0, 5);
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
  const palabrasDocumento = obtenerPalabrasClave(documento.contenido);

  let puntuacion = 0;

  for (const palabra of palabrasConsulta) {
    const coincideContenido = palabrasDocumento.some((termino) =>
      coincideTermino(palabra, termino),
    );

    const coincideNombre = palabrasNombre.some((termino) =>
      coincideTermino(palabra, termino),
    );

    if (coincideContenido) puntuacion += 2;
    if (coincideNombre) puntuacion += 5;
  }

  return puntuacion;
}

// =========================================================
// VALIDAR Y RESOLVER RUTA LOCAL
// =========================================================

async function resolverRutaDocumento(rutaGuardada) {
  if (typeof rutaGuardada !== "string" || !rutaGuardada.trim()) {
    throw new Error("La ruta del documento no es válida.");
  }

  const rutaAbsoluta = path.resolve(__dirname, "../../", rutaGuardada);
  const carpetaReal = await fs.promises.realpath(CONFIG.CARPETA_DOCUMENTOS);
  const archivoReal = await fs.promises.realpath(rutaAbsoluta);

  const rutaRelativa = path.relative(carpetaReal, archivoReal);

  if (
    !rutaRelativa ||
    rutaRelativa.startsWith("..") ||
    path.isAbsolute(rutaRelativa)
  ) {
    throw new Error("La ruta del documento no está autorizada.");
  }

  const extension = path.extname(archivoReal).toLowerCase();

  if (!CONFIG.FORMATOS_PERMITIDOS.includes(extension)) {
    throw new Error("El formato del documento no está habilitado.");
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
// OBTENER EXTENSIÓN DEL DOCUMENTO
// =========================================================

function obtenerExtension(documento) {
  const nombreArchivo =
    documento.storage_path ||
    documento.nombre_archivo ||
    documento.nombre ||
    "";

  let extension = path.extname(nombreArchivo).toLowerCase();

  if (!extension && documento.formato) {
    extension = `.${String(documento.formato)
      .replace(/^\./, "")
      .toLowerCase()}`;
  }

  if (!CONFIG.FORMATOS_PERMITIDOS.includes(extension)) {
    throw new Error("El formato del documento no está permitido.");
  }

  return extension;
}

// =========================================================
// LEER DOCUMENTO DESDE SUPABASE STORAGE
// =========================================================

async function leerDesdeSupabase(documento) {
  if (
    typeof documento.storage_path !== "string" ||
    !documento.storage_path.trim()
  ) {
    throw new Error("El documento no tiene una ruta de almacenamiento.");
  }

  const { data, error } = await supabase.storage
    .from(CONFIG.BUCKET_DOCUMENTOS)
    .download(documento.storage_path);

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Supabase no devolvió el archivo.");
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  const extension = obtenerExtension(documento);

  return extraerTextoDesdeBuffer(buffer, extension);
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
        doc.storage_path,
        doc.formato,
        doc.tamano,
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
          doc.estado_clasificacion = 'transversal'

          OR (
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
      let texto;
      let claveCache;
      let huella;

      // Priorizar Supabase Storage.
      if (documento.storage_path) {
        claveCache = `supabase:${documento.storage_path}`;

        huella = [
          documento.tamano || "",
          documento.fecha_registro
            ? new Date(documento.fecha_registro).getTime()
            : "",
        ].join(":");

        const contenidoEnCache = cacheDocumentos.get(claveCache);

        if (contenidoEnCache && contenidoEnCache.huella === huella) {
          texto = contenidoEnCache.contenido;
        } else {
          try {
            texto = await leerDesdeSupabase(documento);
          } catch (errorStorage) {
            console.error(
              `[ASISTIA - SUPABASE] No se pudo leer ${documento.nombre_archivo}:`,
              errorStorage.message,
            );

            // Respaldo: intentar lectura local.
            const informacion = await resolverRutaDocumento(
              documento.ruta_archivo,
            );

            texto = await extraerTextoDocumento(informacion.ruta);
          }

          if (texto && texto.trim()) {
            texto = texto.slice(0, CONFIG.MAX_CARACTERES_DOCUMENTO);

            cacheDocumentos.set(claveCache, {
              huella,
              contenido: texto,
            });
          }
        }
      } else {
        // Documentos antiguos sin ruta en Supabase.
        const informacion = await resolverRutaDocumento(documento.ruta_archivo);

        claveCache = `local:${informacion.ruta}`;

        const contenidoEnCache = cacheDocumentos.get(claveCache);

        const cacheValida =
          contenidoEnCache &&
          contenidoEnCache.fechaModificacion ===
            informacion.fechaModificacion &&
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
    .sort((a, b) => b.relevancia - a.relevancia)
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
