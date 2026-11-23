const fs = require("fs");
const path = require("path");

const carpetaBackups = path.resolve(__dirname, "../../backups");

const archivos = fs
  .readdirSync(carpetaBackups)
  .filter(
    (nombre) =>
      nombre.startsWith("respaldo-asistia-") && nombre.endsWith(".json"),
  )
  .sort();

if (!archivos.length) {
  throw new Error("No se encontró el respaldo JSON.");
}

const archivo = path.join(carpetaBackups, archivos[archivos.length - 1]);

const respaldo = JSON.parse(fs.readFileSync(archivo, "utf8"));

const tablas = [
  "divisiones",
  "administradores",
  "conversaciones",
  "documentos",
];

function identificador(valor) {
  return `"${String(valor).replace(/"/g, '""')}"`;
}

function literal(valor) {
  if (valor === null || valor === undefined) return "NULL";
  if (typeof valor === "boolean") return valor ? "TRUE" : "FALSE";

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) {
      throw new Error("Número inválido.");
    }

    return String(valor);
  }

  if (typeof valor === "object") {
    return `'${JSON.stringify(valor).replace(/'/g, "''")}'`;
  }

  return `'${String(valor).replace(/'/g, "''")}'`;
}

function numeroSeguro(valor, nombre) {
  const numero = Number(valor);

  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error(`Valor inválido en secuencia ${nombre}.`);
  }

  return numero;
}

const sql = [];

sql.push("-- Migración de AsistIA - TEINCO");
sql.push("-- Generada desde el respaldo local verificado.");
sql.push("-- No elimina ni sobrescribe tablas existentes.");
sql.push("");
sql.push("BEGIN;");
sql.push("");

// 1. Crear secuencias

sql.push("-- 1. Crear secuencias");

for (const [nombre, datos] of Object.entries(respaldo.secuencias)) {
  const config = datos.configuracion;

  if (!config) {
    throw new Error(`Falta configuración de ${nombre}.`);
  }

  sql.push(`
CREATE SEQUENCE public.${identificador(nombre)}
    AS bigint
    INCREMENT BY ${config.increment_by}
    MINVALUE ${config.min_value}
    MAXVALUE ${config.max_value}
    START WITH ${config.start_value}
    CACHE ${config.cache_size}
    ${config.cycle ? "CYCLE" : "NO CYCLE"};
`);
}

// 2. Crear tablas

sql.push("-- 2. Crear tablas");

for (const tabla of tablas) {
  const datos = respaldo.tablas[tabla];

  if (
    !datos ||
    !Array.isArray(datos.columnas) ||
    !Array.isArray(datos.registros)
  ) {
    throw new Error(`Estructura incompleta de ${tabla}.`);
  }

  const definiciones = datos.columnas.map((columna) => {
    let definicion = `${identificador(columna.nombre)} ${columna.tipo}`;

    if (columna.valor_default !== null) {
      definicion += ` DEFAULT ${columna.valor_default}`;
    }

    if (columna.obligatorio) {
      definicion += " NOT NULL";
    }

    return definicion;
  });

  sql.push(`
CREATE TABLE public.${identificador(tabla)} (
    ${definiciones.join(",\n    ")}
);
`);
}

// 3. Insertar registros

sql.push("-- 3. Insertar registros");

for (const tabla of tablas) {
  const datos = respaldo.tablas[tabla];
  const columnas = datos.columnas.map((c) => c.nombre);

  for (const registro of datos.registros) {
    const valores = columnas.map((nombre) => literal(registro[nombre]));

    sql.push(`
INSERT INTO public.${identificador(tabla)}
    (${columnas.map(identificador).join(", ")})
VALUES
    (${valores.join(", ")});
`);
  }
}

// 4. Restaurar restricciones en orden correcto

sql.push("-- 4. Restaurar restricciones");

// Validar las restricciones restaurables.

for (const restriccion of respaldo.restricciones) {
  if (restriccion.tipo === "n") continue;

  if (!["p", "u", "f", "c"].includes(restriccion.tipo)) {
    throw new Error(`Restricción no reconocida: ${restriccion.nombre}`);
  }
}

// Primero: claves primarias y únicas.
// Segundo: restricciones CHECK.
// Tercero: claves foráneas.

for (const tipo of ["p", "u", "c", "f"]) {
  for (const restriccion of respaldo.restricciones) {
    if (restriccion.tipo !== tipo) continue;

    sql.push(`
ALTER TABLE public.${identificador(restriccion.tabla)}
ADD CONSTRAINT ${identificador(restriccion.nombre)}
${restriccion.definicion};
`);
  }
}

// 5. Restaurar índices secundarios

sql.push("-- 5. Restaurar índices secundarios");

for (const indice of respaldo.indices) {
  if (!indice.definicion.startsWith("CREATE INDEX ")) {
    throw new Error(`Índice no reconocido: ${indice.nombre}`);
  }

  sql.push(`${indice.definicion};`);
}

// 6. Asociar secuencias a sus columnas

sql.push("-- 6. Asociar secuencias a sus columnas");

for (const tabla of tablas) {
  for (const columna of respaldo.tablas[tabla].columnas) {
    if (!columna.valor_default) continue;

    const coincidencia = columna.valor_default.match(
      /nextval\(\s*'([^']+)'::regclass\s*\)/i,
    );

    if (!coincidencia) continue;

    const secuencia = coincidencia[1];

    if (!respaldo.secuencias[secuencia]) {
      throw new Error(`Secuencia no encontrada: ${secuencia}`);
    }

    sql.push(`
ALTER SEQUENCE public.${identificador(secuencia)}
OWNED BY public.${identificador(tabla)}.${identificador(columna.nombre)};
`);
  }
}

// 7. Restaurar valores actuales de las secuencias

sql.push("-- 7. Restaurar valores actuales de las secuencias");

for (const [nombre, datos] of Object.entries(respaldo.secuencias)) {
  const valor = numeroSeguro(datos.estado.last_value, nombre);
  const utilizada = datos.estado.is_called ? "TRUE" : "FALSE";

  sql.push(`
SELECT setval(
    ${literal(`public.${nombre}`)},
    ${valor},
    ${utilizada}
);
`);
}

// Finalizar migración

sql.push("COMMIT;");
sql.push("");

const destino = path.join(carpetaBackups, "migracion-supabase.sql");

fs.writeFileSync(destino, sql.join("\n"), "utf8");

console.log("\nMigración SQL generada correctamente.");
console.log(`Archivo: ${destino}`);
console.log(`Tablas: ${tablas.length}`);

console.log(
  `Registros: ${tablas.reduce(
    (total, tabla) => total + respaldo.tablas[tabla].registros.length,
    0,
  )}`,
);

console.log(
  `Restricciones restaurables: ${
    respaldo.restricciones.filter((r) => r.tipo !== "n").length
  }`,
);

console.log(`Índices secundarios: ${respaldo.indices.length}`);

console.log(`Secuencias: ${Object.keys(respaldo.secuencias).length}`);
