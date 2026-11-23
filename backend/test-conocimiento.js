"use strict";

require("dotenv").config();

const {
  obtenerContextoInstitucional,
} = require("./services/conocimiento.service");

async function probar() {
  try {
    console.log("\nPRUEBA DE CONOCIMIENTO INSTITUCIONAL\n");

    const contexto = await obtenerContextoInstitucional(
      "General",
      "¿Qué documentos necesito para ingresar a TEINCO?",
    );

    if (!contexto) {
      console.log("No se encontró información para la consulta.");
    } else {
      console.log("LECTURA EXITOSA:\n");
      console.log(contexto);
    }
  } catch (error) {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
  }
}

probar();
