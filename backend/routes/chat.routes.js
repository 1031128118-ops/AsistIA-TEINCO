/* =========================================================
   ASISTIA — TEINCO
   RUTAS DEL CHAT INSTITUCIONAL
   Archivo: backend/routes/chat.routes.js

   Funciones:
   - Crear el endpoint del chat.
   - Limitar la cantidad de solicitudes.
   - Validar las peticiones recibidas.
   - Enviar las consultas al controlador.
========================================================= */

"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");

const chatController = require("../controllers/chat.controller");

const router = express.Router();

// =========================================================
// LIMITADOR DE SOLICITUDES
// =========================================================

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    mensaje:
      "Has realizado demasiadas consultas. Espera unos minutos e inténtalo nuevamente.",
  },
});

// =========================================================
// ENDPOINT PRINCIPAL
// =========================================================

// POST /api/chat

router.post("/", chatLimiter, chatController.enviarMensaje);

// =========================================================
// EXPORTAR RUTAS
// =========================================================

module.exports = router;
