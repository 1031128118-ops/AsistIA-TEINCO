/* =========================================================
   ASISTIA — TEINCO
   SERVIDOR PRINCIPAL
   Node.js + Express + PostgreSQL
========================================================= */

"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const path = require("path");

const pool = require("./backend/config/database");
const authRoutes = require("./backend/routes/auth.routes");
const adminRoutes = require("./backend/routes/admin.routes");
const chatRoutes = require("./backend/routes/chat.routes");
const divisionesController = require("./backend/controllers/divisiones.controller");

// =========================================================
// VALIDAR CONFIGURACIÓN
// =========================================================

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET no está configurada correctamente en .env");
}

// =========================================================
// APLICACIÓN
// =========================================================

const app = express();

const PORT = process.env.PORT || 3000;
const PUBLIC_PATH = path.join(__dirname, "public");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// =========================================================
// SEGURIDAD
// =========================================================

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Demasiadas solicitudes. Intenta más tarde.",
    },
  }),
);

// =========================================================
// PROCESAMIENTO DE SOLICITUDES
// =========================================================

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

// =========================================================
// SESIONES ALMACENADAS EN POSTGRESQL
// =========================================================

app.use(
  session({
    name: "asistia.sid",

    store: new PgSession({
      pool,
      tableName: "sesiones",
      createTableIfMissing: true,
    }),

    secret: process.env.SESSION_SECRET,

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

// =========================================================
// RUTAS DE AUTENTICACIÓN
// =========================================================

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);

// Ruta pública para consultar las divisiones institucionales activas
app.get("/api/divisiones", divisionesController.listarDivisionesPublicas);

// =========================================================
// PROTECCIÓN DE RUTAS ADMINISTRATIVAS
// =========================================================

function verificarAdministrador(req, res, next) {
  if (!req.session || !req.session.administrador) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      message: "Debes iniciar sesión como administrador.",
    });
  }

  next();
}

// =========================================================
// REPORTES ADMINISTRATIVOS
// GET /api/admin/reportes
// =========================================================

app.get("/api/admin/reportes", verificarAdministrador, async (req, res) => {
  try {
    // -----------------------------------------------------
    // 1. ESTADÍSTICAS GENERALES
    // -----------------------------------------------------

    const estadisticasQuery = await pool.query(`
      SELECT
        COUNT(*)::INTEGER AS "totalConsultas",

        COUNT(*) FILTER (
          WHERE respuesta IS NOT NULL
            AND BTRIM(respuesta) <> ''
        )::INTEGER AS "totalRespuestas",

        COUNT(*) FILTER (
          WHERE respuesta IS NULL
             OR BTRIM(respuesta) = ''
        )::INTEGER AS "consultasSinRespuesta"

      FROM conversaciones
    `);

    // -----------------------------------------------------
    // 2. DIVISIÓN MÁS CONSULTADA
    // Incluye General cuando division_id es NULL.
    // -----------------------------------------------------

    const divisionPopularQuery = await pool.query(`
      SELECT
        CASE
          WHEN c.division_id IS NULL THEN 'General'
          WHEN d.id IS NULL THEN 'División no identificada'
          ELSE d.nombre
        END AS nombre,

        COUNT(*)::INTEGER AS total

      FROM conversaciones c

      LEFT JOIN divisiones d
        ON d.id = c.division_id

      GROUP BY
        CASE
          WHEN c.division_id IS NULL THEN 'General'
          WHEN d.id IS NULL THEN 'División no identificada'
          ELSE d.nombre
        END

      ORDER BY total DESC, nombre ASC

      LIMIT 1
    `);

    const estadisticas = estadisticasQuery.rows[0];

    estadisticas.divisionPopular =
      divisionPopularQuery.rows.length > 0
        ? divisionPopularQuery.rows[0].nombre
        : "Sin registros";

    // -----------------------------------------------------
    // 3. ACTIVIDAD DE LOS ÚLTIMOS SIETE DÍAS
    // -----------------------------------------------------

    const actividadQuery = await pool.query(`
      SELECT
        TO_CHAR(fecha::DATE, 'YYYY-MM-DD') AS fecha,
        COUNT(*)::INTEGER AS total

      FROM conversaciones

      WHERE fecha >= CURRENT_DATE - INTERVAL '6 days'
        AND fecha < CURRENT_DATE + INTERVAL '1 day'

      GROUP BY fecha::DATE

      ORDER BY fecha::DATE ASC
    `);

    // -----------------------------------------------------
    // 4. CONSULTAS POR DIVISIÓN
    // Incluye todas las divisiones y también General.
    // Los totales se calculan con todo el historial.
    // -----------------------------------------------------

    const divisionesQuery = await pool.query(`
      SELECT
        d.nombre,
        COUNT(c.id)::INTEGER AS total

      FROM divisiones d

      LEFT JOIN conversaciones c
        ON c.division_id = d.id

      GROUP BY d.id, d.nombre

      UNION ALL

      SELECT
        'General' AS nombre,
        COUNT(*)::INTEGER AS total

      FROM conversaciones

      WHERE division_id IS NULL

      HAVING COUNT(*) > 0

      ORDER BY total DESC, nombre ASC
    `);

    // -----------------------------------------------------
    // 5. ÚLTIMAS 100 CONVERSACIONES
    // General se muestra cuando division_id es NULL.
    // -----------------------------------------------------

    const conversacionesQuery = await pool.query(`
      SELECT
        c.fecha,
        c.consulta,

        CASE
          WHEN c.division_id IS NULL THEN 'General'
          WHEN d.id IS NULL THEN 'División no identificada'
          ELSE d.nombre
        END AS division,

        c.estado,
        c.respuesta

      FROM conversaciones c

      LEFT JOIN divisiones d
        ON d.id = c.division_id

      ORDER BY c.fecha DESC

      LIMIT 100
    `);

    // -----------------------------------------------------
    // 6. RESPUESTA PARA EL PANEL ADMINISTRATIVO
    // -----------------------------------------------------

    return res.status(200).json({
      success: true,

      message: "Reportes obtenidos correctamente.",

      data: {
        estadisticas,
        actividad: actividadQuery.rows,
        divisiones: divisionesQuery.rows,
        conversaciones: conversacionesQuery.rows,
      },
    });
  } catch (error) {
    console.error(
      "Error al consultar reportes administrativos:",
      error.message,
    );

    return res.status(500).json({
      success: false,
      message: "No fue posible obtener los reportes administrativos.",
    });
  }
});

// =========================================================
// ARCHIVOS DEL FRONTEND
// =========================================================

app.use(express.static(PUBLIC_PATH));

// =========================================================
// VERIFICACIÓN DEL SERVIDOR Y BASE DE DATOS
// =========================================================

app.get("/api/health", async (req, res) => {
  try {
    const resultado = await pool.query("SELECT current_database() AS database");

    return res.status(200).json({
      success: true,
      message: "Servidor de AsistIA funcionando correctamente.",
      application: "AsistIA - TEINCO",
      status: "online",
      database: resultado.rows[0].database,
    });
  } catch (error) {
    console.error("Error verificando PostgreSQL:", error.message);

    return res.status(503).json({
      success: false,
      message: "El servidor está activo, pero la base de datos no responde.",
    });
  }
});

// =========================================================
// RUTAS API NO ENCONTRADAS
// =========================================================

app.use("/api", (req, res) => {
  return res.status(404).json({
    success: false,
    message: "La ruta solicitada no existe.",
  });
});

// =========================================================
// MANEJO GENERAL DE ERRORES
// =========================================================

app.use((err, req, res, next) => {
  console.error("Error del servidor:", err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(err.status || 500).json({
    success: false,
    message: "Ocurrió un error interno en el servidor.",
  });
});

// =========================================================
// INICIAR SERVIDOR
// =========================================================

async function iniciarServidor() {
  try {
    console.log("Verificando conexión con PostgreSQL...");

    await pool.query("SELECT 1");

    console.log("PostgreSQL conectado correctamente.");

    app.listen(PORT, () => {
      console.log("");
      console.log("=========================================");
      console.log("          ASISTIA — TEINCO");
      console.log("=========================================");
      console.log(`Servidor: http://localhost:${PORT}`);
      console.log(`Estado: http://localhost:${PORT}/api/health`);
      console.log("PostgreSQL: conectado");
      console.log("Sesiones: configuradas");
      console.log("Reportes administrativos: configurados");
      console.log("=========================================");
      console.log("");
    });
  } catch (error) {
    console.error("\n❌ NO FUE POSIBLE INICIAR ASISTIA");
    console.error("Error completo:", error);
    console.error("Mensaje:", error?.message);
    console.error("Código:", error?.code);
    console.error("Detalle:", error?.detail);
    console.error("Stack:", error?.stack);

    process.exit(1);
  }
}

iniciarServidor();
