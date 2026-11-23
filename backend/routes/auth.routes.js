"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");

const authController = require("../controllers/auth.controller");

const router = express.Router();

// =====================================================
// LÍMITE DE INTENTOS PARA EL REGISTRO
// =====================================================

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiados intentos de registro. Inténtalo más tarde.",
  },
});

// =====================================================
// LÍMITE DE INTENTOS PARA EL INICIO DE SESIÓN
// =====================================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Demasiados intentos de inicio de sesión. Inténtalo más tarde.",
  },
});

// =====================================================
// RUTAS
// =====================================================

// Registrar administrador
router.post("/register", registerLimiter, authController.registrar);

// Iniciar sesión
router.post("/login", loginLimiter, authController.iniciarSesion);

// Consultar sesión activa
router.get("/me", authController.obtenerSesion);

// Cerrar sesión
router.post("/logout", authController.cerrarSesion);

module.exports = router;
