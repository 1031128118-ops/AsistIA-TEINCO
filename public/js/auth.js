/* =========================================================
   ASISTIA — SISTEMA DE AUTENTICACIÓN
   TEINCO
   Preparado para Node.js + Express + PostgreSQL
========================================================= */

"use strict";

/* =========================================================
   1. CONFIGURACIÓN
========================================================= */

const AUTH_CONFIG = Object.freeze({
  API_URL: "/api/auth",

  LOGIN_PAGE: "admin-login.html",
  DASHBOARD_PAGE: "admin-reportes.html",

  PROTECTED_PAGES: ["admin-reportes.html", "admin-divisiones.html"],

  MIN_PASSWORD_LENGTH: 12,
  MAX_PASSWORD_LENGTH: 128,

  MIN_USERNAME_LENGTH: 4,
});

/* =========================================================
   2. UTILIDADES GENERALES
========================================================= */

const Auth = {
  getElement(id) {
    return document.getElementById(id);
  },

  getValue(id) {
    return this.getElement(id)?.value.trim() || "";
  },

  getCurrentPage() {
    return window.location.pathname.split("/").pop();
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  async request(endpoint, options = {}) {
    let response;

    try {
      response = await fetch(`${AUTH_CONFIG.API_URL}${endpoint}`, {
        method: options.method || "GET",

        credentials: "same-origin",

        headers: {
          Accept: "application/json",

          ...(options.body ? { "Content-Type": "application/json" } : {}),

          ...options.headers,
        },

        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch {
      throw new Error(
        "No fue posible conectar con el servidor. Verifica tu conexión.",
      );
    }

    let data = {};

    try {
      const contenido = await response.text();

      data = contenido ? JSON.parse(contenido) : {};
    } catch {
      throw new Error("El servidor devolvió una respuesta inválida.");
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
          data.mensaje ||
          "No fue posible completar la solicitud.",
      );
    }

    return data;
  },

  showMessage(message, type = "error", form) {
    if (!form) return;

    const page = this.getCurrentPage();

    let feedback = null;

    if (page === "admin-login.html") {
      feedback = this.getElement("mensaje-login");
    }

    if (page === "admin-crear-cuenta.html") {
      feedback = this.getElement("mensaje-formulario");
    }

    if (!feedback) {
      feedback = form.querySelector(".auth-feedback");
    }

    if (!feedback) {
      feedback = document.createElement("div");

      feedback.className = "auth-feedback";

      feedback.setAttribute("role", "alert");
      feedback.setAttribute("aria-live", "polite");

      form.prepend(feedback);
    }

    feedback.textContent = message;

    feedback.dataset.type = type;

    feedback.hidden = false;
  },

  clearMessage(form) {
    if (!form) return;

    const page = this.getCurrentPage();

    const feedback =
      page === "admin-login.html"
        ? this.getElement("mensaje-login")
        : page === "admin-crear-cuenta.html"
          ? this.getElement("mensaje-formulario")
          : form.querySelector(".auth-feedback");

    if (feedback) {
      feedback.textContent = "";
      feedback.hidden = true;
    }
  },

  setLoading(form, loading) {
    if (!form) return;

    const button = form.querySelector('[type="submit"]');

    if (!button) return;

    if (loading) {
      if (!button.dataset.originalDisabled) {
        button.dataset.originalDisabled = String(button.disabled);
      }

      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      button.disabled = button.dataset.originalDisabled === "true";

      delete button.dataset.originalDisabled;

      button.removeAttribute("aria-busy");
    }
  },

  clearFieldError(input, errorElement) {
    if (input) {
      input.removeAttribute("aria-invalid");
    }

    if (errorElement) {
      errorElement.textContent = "";
    }
  },

  setFieldError(input, errorElement, message) {
    if (input) {
      input.setAttribute("aria-invalid", "true");
    }

    if (errorElement) {
      errorElement.textContent = message;
    }
  },
};

/* =========================================================
   3. MOSTRAR / OCULTAR CONTRASEÑAS
========================================================= */

function configurarVisibilidadContrasenas() {
  const botones = [
    {
      button: "btn-mostrar-clave",
      input: "clave-admin",
    },
    {
      button: "btn-mostrar-clave",
      input: "clave-nueva",
    },
    {
      button: "btn-mostrar-confirmacion",
      input: "confirmar-clave",
    },
  ];

  botones.forEach(({ button, input }) => {
    const boton = Auth.getElement(button);
    const campo = Auth.getElement(input);

    if (!boton || !campo) return;

    if (boton.dataset.configurado === "true") return;

    boton.dataset.configurado = "true";

    boton.addEventListener("click", () => {
      const mostrar = campo.type === "password";

      campo.type = mostrar ? "text" : "password";

      boton.setAttribute("aria-pressed", String(mostrar));

      boton.setAttribute(
        "aria-label",
        mostrar ? "Ocultar contraseña" : "Mostrar contraseña",
      );

      if (boton.querySelector("svg")) {
        // El SVG original del diseño se conserva.
        return;
      }

      boton.textContent = mostrar ? "Ocultar" : "Mostrar";
    });
  });
}

/* =========================================================
   4. AÑO AUTOMÁTICO
========================================================= */

function configurarAnio() {
  const elemento = Auth.getElement("current-year");

  if (elemento) {
    elemento.textContent = new Date().getFullYear();
  }
}

/* =========================================================
   5. INICIO DE SESIÓN
========================================================= */

function configurarLogin() {
  const form = Auth.getElement("form-login-admin");

  if (!form) return;

  if (form.dataset.authConfigurado === "true") return;

  form.dataset.authConfigurado = "true";

  const usuarioInput = Auth.getElement("usuario-admin");
  const claveInput = Auth.getElement("clave-admin");

  const errorUsuario = Auth.getElement("error-usuario");
  const errorClave = Auth.getElement("error-clave");

  if (!usuarioInput || !claveInput) return;

  function limpiarErrores() {
    Auth.clearFieldError(usuarioInput, errorUsuario);
    Auth.clearFieldError(claveInput, errorClave);

    Auth.clearMessage(form);
  }

  usuarioInput.addEventListener("input", limpiarErrores);
  claveInput.addEventListener("input", limpiarErrores);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (form.dataset.loading === "true") return;

    limpiarErrores();

    const usuario = usuarioInput.value.trim();
    const clave = claveInput.value;

    let valido = true;

    if (!usuario) {
      Auth.setFieldError(
        usuarioInput,
        errorUsuario,
        "Ingresa tu usuario o correo electrónico.",
      );

      valido = false;
    }

    if (!clave) {
      Auth.setFieldError(claveInput, errorClave, "Ingresa tu contraseña.");

      valido = false;
    }

    if (!valido) {
      Auth.showMessage(
        "Revisa los campos e intenta nuevamente.",
        "error",
        form,
      );

      return;
    }

    form.dataset.loading = "true";

    Auth.setLoading(form, true);

    try {
      const resultado = await Auth.request("/login", {
        method: "POST",

        body: {
          usuario,
          password: clave,
        },
      });

      if (resultado.success !== true) {
        throw new Error(resultado.message || "No fue posible iniciar sesión.");
      }

      Auth.showMessage(
        "Acceso autorizado. Redirigiendo al panel...",
        "success",
        form,
      );

      window.location.replace(AUTH_CONFIG.DASHBOARD_PAGE);
    } catch (error) {
      Auth.showMessage(
        error.message || "No fue posible iniciar sesión.",
        "error",
        form,
      );

      Auth.setLoading(form, false);

      form.dataset.loading = "false";
    }
  });
}

/* =========================================================
   6. CREACIÓN DE CUENTA ADMINISTRATIVA
========================================================= */

function configurarRegistro() {
  const form = Auth.getElement("form-crear-cuenta");

  if (!form) return;

  if (form.dataset.authConfigurado === "true") return;

  form.dataset.authConfigurado = "true";

  const nombre = Auth.getElement("nombre-completo");
  const correo = Auth.getElement("correo-admin");
  const usuario = Auth.getElement("usuario-nuevo");

  const clave = Auth.getElement("clave-nueva");
  const confirmarClave = Auth.getElement("confirmar-clave");

  const codigo = Auth.getElement("codigo-autorizacion");

  const aceptar = Auth.getElement("aceptar-condiciones");

  if (
    !nombre ||
    !correo ||
    !usuario ||
    !clave ||
    !confirmarClave ||
    !codigo ||
    !aceptar
  ) {
    console.error("AsistIA: faltan campos del formulario de registro.");

    return;
  }

  function validarCoincidencia() {
    confirmarClave.setCustomValidity("");

    if (confirmarClave.value && confirmarClave.value !== clave.value) {
      confirmarClave.setCustomValidity("Las contraseñas no coinciden.");
    }
  }

  clave.addEventListener("input", validarCoincidencia);
  confirmarClave.addEventListener("input", validarCoincidencia);

  form.addEventListener("input", () => {
    Auth.clearMessage(form);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (form.dataset.loading === "true") return;

    Auth.clearMessage(form);

    validarCoincidencia();

    if (!form.reportValidity()) return;

    const datos = {
      nombreCompleto: nombre.value.trim(),

      correo: correo.value.trim().toLowerCase(),

      usuario: usuario.value.trim(),

      clave: clave.value,

      codigoAutorizacion: codigo.value.trim(),
    };

    if (datos.nombreCompleto.length < 3) {
      Auth.showMessage(
        "El nombre completo debe tener al menos 3 caracteres.",
        "error",
        form,
      );

      nombre.focus();

      return;
    }

    if (!Auth.isValidEmail(datos.correo)) {
      Auth.showMessage("Ingresa un correo electrónico válido.", "error", form);

      correo.focus();

      return;
    }

    if (datos.usuario.length < AUTH_CONFIG.MIN_USERNAME_LENGTH) {
      Auth.showMessage(
        "El usuario debe tener al menos 4 caracteres.",
        "error",
        form,
      );

      usuario.focus();

      return;
    }

    if (datos.clave.length < AUTH_CONFIG.MIN_PASSWORD_LENGTH) {
      Auth.showMessage(
        "La contraseña debe tener al menos 12 caracteres.",
        "error",
        form,
      );

      clave.focus();

      return;
    }

    if (datos.clave.length > AUTH_CONFIG.MAX_PASSWORD_LENGTH) {
      Auth.showMessage(
        "La contraseña supera la longitud máxima permitida.",
        "error",
        form,
      );

      clave.focus();

      return;
    }

    if (datos.clave !== confirmarClave.value) {
      Auth.showMessage("Las contraseñas no coinciden.", "error", form);

      confirmarClave.focus();

      return;
    }

    if (!aceptar.checked) {
      Auth.showMessage(
        "Debes aceptar la confirmación de autorización institucional.",
        "error",
        form,
      );

      aceptar.focus();

      return;
    }

    if (!datos.codigoAutorizacion) {
      Auth.showMessage(
        "Ingresa el código de autorización institucional.",
        "error",
        form,
      );

      codigo.focus();

      return;
    }

    form.dataset.loading = "true";

    Auth.setLoading(form, true);

    try {
      const resultado = await Auth.request("/register", {
        method: "POST",

        body: datos,
      });

      if (resultado.success === false) {
        throw new Error(
          resultado.message || "No fue posible enviar la solicitud.",
        );
      }

      Auth.showMessage(
        resultado.message ||
          "Solicitud enviada correctamente. Tu cuenta deberá ser aprobada por el administrador autorizado.",
        "success",
        form,
      );

      form.reset();

      confirmarClave.setCustomValidity("");

      form.dataset.loading = "false";

      Auth.setLoading(form, false);
    } catch (error) {
      Auth.showMessage(
        error.message || "No fue posible enviar la solicitud.",
        "error",
        form,
      );

      form.dataset.loading = "false";

      Auth.setLoading(form, false);
    }
  });
}

/* =========================================================
   7. CERRAR SESIÓN
========================================================= */

async function cerrarSesion() {
  try {
    await Auth.request("/logout", {
      method: "POST",
    });
  } catch (error) {
    console.error("AsistIA: error cerrando sesión:", error);
  } finally {
    window.location.replace(AUTH_CONFIG.LOGIN_PAGE);
  }
}

/* =========================================================
   8. VERIFICAR SESIÓN
========================================================= */

async function verificarSesion() {
  const pagina = Auth.getCurrentPage();

  if (!AUTH_CONFIG.PROTECTED_PAGES.includes(pagina)) {
    return;
  }

  document.documentElement.classList.remove("sesion-verificada");

  try {
    const resultado = await Auth.request("/me");

    if (resultado.authenticated !== true) {
      throw new Error("Sesión no autorizada.");
    }

    document.documentElement.classList.add("sesion-verificada");
  } catch {
    window.location.replace(AUTH_CONFIG.LOGIN_PAGE);
  }
}

/* =========================================================
   9. EVENTOS DE CIERRE DE SESIÓN
========================================================= */

function configurarCierreSesion() {
  document.querySelectorAll('[data-action="logout"]').forEach((elemento) => {
    if (elemento.dataset.logoutConfigurado === "true") {
      return;
    }

    elemento.dataset.logoutConfigurado = "true";

    elemento.addEventListener("click", (event) => {
      event.preventDefault();

      cerrarSesion();
    });
  });

  const boton = Auth.getElement("btn-cerrar-sesion");

  if (boton && boton.dataset.logoutConfigurado !== "true") {
    boton.dataset.logoutConfigurado = "true";

    boton.addEventListener("click", (event) => {
      event.preventDefault();

      cerrarSesion();
    });
  }
}

/* =========================================================
   10. INICIALIZACIÓN GENERAL
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  configurarAnio();

  configurarVisibilidadContrasenas();

  configurarLogin();

  configurarRegistro();

  configurarCierreSesion();

  verificarSesion();
});
