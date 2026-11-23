/* =========================================================
   ASISTIA — TEINCO
   CONTROLADOR DE AUTENTICACIÓN
   Registro, inicio de sesión y cierre de sesión
========================================================= */

"use strict";

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../config/database");

// =========================================================
// CONFIGURACIÓN
// =========================================================

const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const USERNAME_MIN = 4;

// =========================================================
// RESPUESTAS
// =========================================================

function responder(res, status, success, message, data = null) {
  return res.status(status).json({
    success,
    message,
    ...(data ? { data } : {}),
  });
}

// =========================================================
// COMPARACIÓN SEGURA DEL CÓDIGO DE AUTORIZACIÓN
// =========================================================

function compararCodigo(codigo, codigoEsperado) {
  if (!codigo || !codigoEsperado) return false;

  const recibido = Buffer.from(String(codigo));
  const esperado = Buffer.from(String(codigoEsperado));

  if (recibido.length !== esperado.length) {
    return false;
  }

  return crypto.timingSafeEqual(recibido, esperado);
}

// =========================================================
// REGISTRO DE ADMINISTRADORES
// POST /api/auth/register
// =========================================================

async function registrar(req, res) {
  try {
    const { nombreCompleto, correo, usuario, clave, codigoAutorizacion } =
      req.body || {};

    if (
      !nombreCompleto ||
      !correo ||
      !usuario ||
      !clave ||
      !codigoAutorizacion
    ) {
      return responder(
        res,
        400,
        false,
        "Todos los campos obligatorios deben completarse.",
      );
    }

    const nombre = String(nombreCompleto).trim();
    const email = String(correo).trim().toLowerCase();
    const username = String(usuario).trim().toLowerCase();
    const password = String(clave);

    if (nombre.length < 3 || nombre.length > 150) {
      return responder(
        res,
        400,
        false,
        "El nombre debe tener entre 3 y 150 caracteres.",
      );
    }

    if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responder(res, 400, false, "El correo no es válido.");
    }

    if (
      username.length < USERNAME_MIN ||
      username.length > 60 ||
      !/^[a-zA-Z0-9._-]+$/.test(username)
    ) {
      return responder(
        res,
        400,
        false,
        "El usuario debe tener entre 4 y 60 caracteres y utilizar únicamente letras, números, puntos, guiones o guiones bajos.",
      );
    }

    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return responder(
        res,
        400,
        false,
        "La contraseña debe tener entre 12 y 128 caracteres.",
      );
    }

    if (
      !compararCodigo(codigoAutorizacion, process.env.ADMIN_REGISTRATION_CODE)
    ) {
      return responder(
        res,
        403,
        false,
        "El código de autorización no es válido.",
      );
    }

    e;

    const existente = await pool.query(
      `SELECT id
       FROM administradores
       WHERE correo = $1 OR usuario = $2
       LIMIT 1`,
      [email, username],
    );

    if (existente.rowCount > 0) {
      return responder(
        res,
        409,
        false,
        "El correo o el nombre de usuario ya está registrado.",
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const resultado = await pool.query(
      `INSERT INTO administradores
        (nombre_completo, correo, usuario, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING
        id,
        nombre_completo,
        correo,
        usuario,
        activo,
        fecha_creacion`,
      [nombre, email, username, passwordHash],
    );

    const administrador = resultado.rows[0];

    return responder(
      res,
      201,
      true,
      "La cuenta administrativa fue creada correctamente.",
      {
        administrador: {
          id: administrador.id,
          nombreCompleto: administrador.nombre_completo,
          correo: administrador.correo,
          usuario: administrador.usuario,
          activo: administrador.activo,
        },
      },
    );
  } catch (error) {
    console.error("Error en el registro:", error.message);

    if (error.code === "23505") {
      return responder(
        res,
        409,
        false,
        "El correo o el usuario ya está registrado.",
      );
    }

    return responder(
      res,
      500,
      false,
      "No fue posible crear la cuenta administrativa.",
    );
  }
}

// =========================================================
// INICIO DE SESIÓN
// POST /api/auth/login
// =========================================================

async function iniciarSesion(req, res) {
  try {
    const { usuario, password } = req.body || {};

    if (!usuario || !password) {
      return responder(
        res,
        400,
        false,
        "Debes ingresar tu usuario y contraseña.",
      );
    }

    if (!req.session) {
      return responder(
        res,
        500,
        false,
        "El sistema de sesiones no está disponible.",
      );
    }

    const identificador = String(usuario).trim().toLowerCase();

    const resultado = await pool.query(
      `SELECT
        id,
        nombre_completo,
        correo,
        usuario,
        password_hash,
        activo
       FROM administradores
       WHERE LOWER(usuario) = $1
          OR LOWER(correo) = $1
       LIMIT 1`,
      [identificador],
    );

    if (resultado.rowCount === 0) {
      return responder(res, 401, false, "Usuario o contraseña incorrectos.");
    }

    const administrador = resultado.rows[0];

    if (!administrador.activo) {
      return responder(
        res,
        403,
        false,
        "Esta cuenta administrativa se encuentra desactivada.",
      );
    }

    const passwordValida = await bcrypt.compare(
      String(password),
      administrador.password_hash,
    );

    if (!passwordValida) {
      return responder(res, 401, false, "Usuario o contraseña incorrectos.");
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    req.session.administrador = {
      id: administrador.id,
      nombreCompleto: administrador.nombre_completo,
      correo: administrador.correo,
      usuario: administrador.usuario,
    };

    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    return res.status(200).json({
      success: true,
      authenticated: true,
      message: "Inicio de sesión exitoso.",
      administrador: req.session.administrador,
    });
  } catch (error) {
    console.error("Error en el inicio de sesión:", error.message);

    return responder(res, 500, false, "No fue posible iniciar sesión.");
  }
}

// =========================================================
// CONSULTAR SESIÓN ACTUAL
// GET /api/auth/me
// =========================================================

function obtenerSesion(req, res) {
  if (!req.session || !req.session.administrador) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      message: "No hay una sesión administrativa activa.",
    });
  }

  return res.status(200).json({
    success: true,
    authenticated: true,
    message: "Sesión administrativa activa.",
    administrador: req.session.administrador,
  });
}

// =========================================================
// CERRAR SESIÓN
// POST /api/auth/logout
// =========================================================

function cerrarSesion(req, res) {
  if (!req.session) {
    return res.status(200).json({
      success: true,
      authenticated: false,
      message: "La sesión ya estaba cerrada.",
    });
  }

  req.session.destroy((error) => {
    if (error) {
      console.error("Error al cerrar sesión:", error.message);

      return responder(res, 500, false, "No fue posible cerrar la sesión.");
    }

    res.clearCookie("asistia.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return res.status(200).json({
      success: true,
      authenticated: false,
      message: "Sesión cerrada correctamente.",
    });
  });
}

// =========================================================
// EXPORTACIONES
// =========================================================

module.exports = {
  registrar,
  iniciarSesion,
  obtenerSesion,
  cerrarSesion,
};
