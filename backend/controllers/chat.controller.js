/* =========================================================
   ASISTIA — TEINCO
   CONTROLADOR DEL CHAT INSTITUCIONAL
========================================================= */

"use strict";

const pool = require("../config/database");
const groqService = require("../services/groq.service");
const conocimientoService = require("../services/conocimiento.service");

// =========================================================
// CONFIGURACIÓN
// =========================================================

const CHAT_CONFIG = Object.freeze({
  MAX_MENSAJE: 2000,
  MAX_MENSAJES_HISTORIAL: 12,
  MAX_MENSAJES_CONTEXTO: 4,
  ESTADO_RESPUESTA: "Respondida",
});

// =========================================================
// NORMALIZAR TEXTO
// =========================================================

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// =========================================================
// NORMALIZAR HISTORIAL DE CONVERSACIÓN
// =========================================================

function normalizarHistorial(historial) {
  if (!Array.isArray(historial)) {
    return [];
  }

  return historial
    .filter((item) => {
      return (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string" &&
        item.content.trim().length > 0
      );
    })
    .slice(-CHAT_CONFIG.MAX_MENSAJES_HISTORIAL)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, CHAT_CONFIG.MAX_MENSAJE),
    }));
}

// =========================================================
// DETECTAR SI EL MENSAJE NECESITA CONTEXTO ANTERIOR
// =========================================================

function necesitaContextoAnterior(mensaje) {
  const texto = normalizarTexto(mensaje);

  // Si menciona una división o un tema institucional
  // concreto, se considera una consulta identificable.
  const temasExplicitos = [
    /\bbienestar\b/,
    /\badmision(?:es)?\b/,
    /\binscrip\w*\b/,
    /\bregistro y control\b/,
    /\bcertificad\w*\b/,
    /\bmatricul\w*\b/,
    /\bcoordinacion academica\b/,
    /\bhorarios?\b/,
    /\basignaturas?\b/,
    /\bprogramas? academicos?\b/,
    /\bteinco\b/,
  ];

  if (temasExplicitos.some((patron) => patron.test(texto))) {
    return false;
  }

  const expresionesSeguimiento = [
    /\bcuentame mas\b/,
    /\bexplicame mas\b/,
    /\bdime mas\b/,
    /\bque mas\b/,
    /\bcuales tienen\b/,
    /\bcuales son\b/,
    /\by como\b/,
    /\by despues\b/,
    /\by cuanto\b/,
    /\bcomo puedo acceder\b/,
    /\bcomo funciona\b/,
    /\bcomo puedo hacerlo\b/,
    /\bpor que\b/,
    /\bcomo asi\b/,
    /\besa\b/,
    /\bese\b/,
    /\beso\b/,
    /\bel primero\b/,
    /\bla primera\b/,
    /\bsi\b/,
    /\bno\b/,
    /\bclaro\b/,
    /\bexactamente\b/,
  ];

  if (expresionesSeguimiento.some((patron) => patron.test(texto))) {
    return true;
  }

  // Los mensajes breves sin un tema identificable
  // también pueden depender del contexto anterior.
  return texto.length <= 65;
}

// =========================================================
// CONSTRUIR CONSULTA CON CONTEXTO
// =========================================================

function construirConsultaContextual(mensaje, historial) {
  if (!necesitaContextoAnterior(mensaje)) {
    return mensaje;
  }

  const mensajesAnteriores = historial
    .filter((item) => item.role === "user")
    .slice(-CHAT_CONFIG.MAX_MENSAJES_CONTEXTO)
    .map((item) => item.content);

  if (mensajesAnteriores.length === 0) {
    return mensaje;
  }

  return [...mensajesAnteriores, mensaje].join("\n");
}

// =========================================================
// CONSULTAR DIVISIONES ACTIVAS
// =========================================================

async function obtenerDivisionesActivas() {
  const consultaSQL = `
    SELECT id, nombre, descripcion
    FROM divisiones
    WHERE activa = TRUE
    ORDER BY nombre ASC
  `;

  const resultado = await pool.query(consultaSQL);

  return resultado.rows;
}

// =========================================================
// BUSCAR UNA DIVISIÓN POR NOMBRE O ID
// =========================================================

function buscarDivision(division, divisiones) {
  if (typeof division !== "string" || !division.trim()) {
    return null;
  }

  const valor = normalizarTexto(division);

  return (
    divisiones.find((item) => {
      return (
        normalizarTexto(item.nombre) === valor ||
        normalizarTexto(item.id) === valor
      );
    }) || null
  );
}

// =========================================================
// RESOLVER DIVISIÓN SELECCIONADA
// =========================================================

function obtenerDivision(division, divisiones) {
  const encontrada = buscarDivision(division, divisiones);

  return encontrada ? encontrada.nombre : "General";
}

// =========================================================
// OBTENER ID DE DIVISIÓN
// =========================================================

function obtenerDivisionId(division, divisiones) {
  const encontrada = buscarDivision(division, divisiones);

  return encontrada ? encontrada.id : null;
}

// =========================================================
// GUARDAR CONVERSACIÓN
// =========================================================

async function guardarConversacion({
  division,
  consulta,
  respuesta,
  divisiones,
}) {
  const consultaSQL = `
    INSERT INTO conversaciones (
      division_id,
      consulta,
      respuesta,
      estado
    )
    VALUES ($1, $2, $3, $4)
    RETURNING id, fecha
  `;

  const valores = [
    obtenerDivisionId(division, divisiones),
    consulta,
    respuesta,
    CHAT_CONFIG.ESTADO_RESPUESTA,
  ];

  const resultado = await pool.query(consultaSQL, valores);

  return resultado.rows[0];
}

// =========================================================
// PROCESAR MENSAJE
// =========================================================

async function enviarMensaje(req, res) {
  try {
    const { mensaje, division, historial } = req.body || {};

    // -----------------------------------------------------
    // 1. VALIDAR MENSAJE ACTUAL
    // -----------------------------------------------------

    if (typeof mensaje !== "string" || !mensaje.trim()) {
      return res.status(400).json({
        success: false,
        mensaje: "Debes escribir una pregunta.",
      });
    }

    const mensajeLimpio = mensaje.trim();

    if (mensajeLimpio.length > CHAT_CONFIG.MAX_MENSAJE) {
      return res.status(400).json({
        success: false,
        mensaje: "Tu pregunta supera el límite permitido.",
      });
    }

    // -----------------------------------------------------
    // 2. NORMALIZAR HISTORIAL TEMPORAL
    // -----------------------------------------------------

    const historialConversacion = normalizarHistorial(historial);

    // -----------------------------------------------------
    // 3. CONSTRUIR CONSULTA CON CONTEXTO
    // -----------------------------------------------------

    const consultaContextual = construirConsultaContextual(
      mensajeLimpio,
      historialConversacion,
    );

    // -----------------------------------------------------
    // 4. CONSULTAR DIVISIONES ACTIVAS
    // -----------------------------------------------------

    const divisionesActivas = await obtenerDivisionesActivas();

    // -----------------------------------------------------
    // 5. OBTENER DIVISIÓN SELECCIONADA
    // -----------------------------------------------------

    const divisionSeleccionada = obtenerDivision(division, divisionesActivas);

    // -----------------------------------------------------
    // 6. IDENTIFICAR DIVISIÓN CON CONTEXTO
    // -----------------------------------------------------

    let divisionIdentificada = divisionSeleccionada;

    try {
      const resultadoClasificacion = await groqService.identificarDivision({
        mensaje: consultaContextual,
        division: divisionSeleccionada,
        divisiones: divisionesActivas,
      });

      const divisionEncontrada = buscarDivision(
        resultadoClasificacion,
        divisionesActivas,
      );

      if (divisionEncontrada) {
        divisionIdentificada = divisionEncontrada.nombre;
      } else if (
        resultadoClasificacion === "General" &&
        divisionSeleccionada === "General"
      ) {
        divisionIdentificada = "General";
      }
    } catch (error) {
      console.error(
        "[ASISTIA - CLASIFICACIÓN] Error identificando división:",
        error.message,
      );
    }

    // -----------------------------------------------------
    // 7. CONSULTAR DOCUMENTOS DE LA DIVISIÓN IDENTIFICADA
    // -----------------------------------------------------

    let contextoDocumentos = "";

    try {
      contextoDocumentos =
        await conocimientoService.obtenerContextoInstitucional(
          divisionIdentificada,
          consultaContextual,
        );
    } catch (error) {
      console.error(
        "[ASISTIA - CHAT] Error consultando documentos:",
        error.message,
      );

      contextoDocumentos = "";
    }

    // -----------------------------------------------------
    // 8. GENERAR RESPUESTA CON HISTORIAL COMPLETO
    // -----------------------------------------------------

    const respuesta = await groqService.generarRespuesta({
      mensaje: mensajeLimpio,
      historial: historialConversacion,
      division: divisionIdentificada,
      contextoDocumentos,
      divisiones: divisionesActivas,
    });

    // -----------------------------------------------------
    // 9. GUARDAR CONSULTA Y RESPUESTA
    // -----------------------------------------------------

    let registroGuardado = false;
    let registro = null;

    try {
      registro = await guardarConversacion({
        division: divisionIdentificada,
        consulta: mensajeLimpio,
        respuesta,
        divisiones: divisionesActivas,
      });

      registroGuardado = true;

      console.log(
        `[ASISTIA - BD] Conversación ${registro.id} guardada en ${divisionIdentificada}.`,
      );
    } catch (error) {
      console.error(
        "[ASISTIA - BD] No fue posible guardar la conversación:",
        error.message,
      );
    }

    // -----------------------------------------------------
    // 10. DEVOLVER RESPUESTA
    // -----------------------------------------------------

    return res.status(200).json({
      success: true,
      respuesta,
      division: divisionIdentificada,
      documentosConsultados: Boolean(contextoDocumentos),
      registroGuardado,
    });
  } catch (error) {
    console.error("[ASISTIA - CHAT] Error:", error.message);

    if (error.message && error.message.includes("GROQ_API_KEY")) {
      return res.status(500).json({
        success: false,
        mensaje: "El servicio de inteligencia artificial no está configurado.",
      });
    }

    return res.status(503).json({
      success: false,
      mensaje:
        "En este momento no puedo procesar tu consulta. Inténtalo nuevamente en unos minutos.",
    });
  }
}

// =========================================================
// EXPORTAR CONTROLADOR
// =========================================================

module.exports = {
  enviarMensaje,
};
