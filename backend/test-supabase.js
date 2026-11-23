
"use strict";

require("dotenv").config();

const supabase = require("./config/supabase");

async function probarSupabase() {
  console.log("\n==================================");
  console.log(" ASISTIA — PRUEBA DE SUPABASE");
  console.log("==================================");

  try {
    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET_DOCUMENTOS || "documentos")
      .list("Untitled folder", {
        limit: 20,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      throw error;
    }

    console.log("CONEXIÓN EXITOSA");
    console.log("Bucket: documentos");
    console.log("Archivos encontrados:", data.length);

    data.forEach((archivo) => {
      console.log("-", archivo.name);
    });

    console.log("\nSUPABASE STORAGE ESTÁ DISPONIBLE.");
  } catch (error) {
    console.error("\nERROR DE CONEXIÓN CON SUPABASE:");
    console.error(error.message);
    process.exitCode = 1;
  }
}

probarSupabase();
