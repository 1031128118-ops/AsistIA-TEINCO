/* =========================================================
   ASISTIA — TEINCO
   SISTEMA DE CHAT
========================================================= */

"use strict";

// =========================================================
// 1. CONFIGURACIÓN
// =========================================================

const CHAT_CONFIG = Object.freeze({
  API_URL: "/api/chat",
  METHOD: "POST",
  MAX_MESSAGE_LENGTH: 2000,
  REQUEST_TIMEOUT: 30000,
  DEFAULT_DIVISION: "General",
});

// =========================================================
// 2. ELEMENTOS DEL DOM
// =========================================================

const Chat = (() => {
  const elementos = {
    cajaMensajes: document.getElementById("caja-mensajes"),
    formulario: document.getElementById("form-chat"),
    entrada: document.getElementById("entrada-mensaje"),
    indicador: document.getElementById("indicador-escribiendo"),
    sugerencias: document.querySelectorAll(".btn-sugerencia"),
    botonEnviar: null,
    contextoDivision: document.getElementById("division-context"),
    nombreDivision: document.getElementById("division-seleccionada"),
  };

  // =======================================================
  // 3. ESTADO DEL CHAT
  // =======================================================

  let enviando = false;
  let divisionActual = CHAT_CONFIG.DEFAULT_DIVISION;
  let controladorPeticion = null;

  // Historial temporal de la conversación.
  // Se reinicia automáticamente al recargar la página.
  let historialConversacion = [];

  const MAX_MENSAJES_HISTORIAL = 12;

  // =======================================================
  // 4. UTILIDADES
  // =======================================================

  function obtenerParametroDivision() {
    const parametros = new URLSearchParams(window.location.search);

    return parametros.get("division") || "";
  }

  async function obtenerDivisionesActivas() {
    const respuesta = await fetch("/api/divisiones", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!respuesta.ok) {
      throw new Error(
        "No fue posible consultar las divisiones institucionales.",
      );
    }

    const resultado = await respuesta.json();

    if (!resultado.success || !Array.isArray(resultado.data?.divisiones)) {
      throw new Error("La lista de divisiones recibida no es válida.");
    }

    return resultado.data.divisiones;
  }

  function normalizarTexto(texto) {
    return String(texto || "").trim();
  }

  function obtenerHora() {
    return new Intl.DateTimeFormat("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  }

  function desplazarAlFinal() {
    if (!elementos.cajaMensajes) return;

    elementos.cajaMensajes.scrollTo({
      top: elementos.cajaMensajes.scrollHeight,
      behavior: "smooth",
    });
  }

  function mostrarIndicador(mostrar) {
    if (!elementos.indicador) return;

    elementos.indicador.classList.toggle("oculto", !mostrar);
  }

  function establecerEstadoEnvio(estado) {
    enviando = estado;

    if (elementos.entrada) {
      elementos.entrada.disabled = estado;
    }

    if (elementos.botonEnviar) {
      elementos.botonEnviar.disabled = estado;
    }

    if (elementos.formulario) {
      elementos.formulario.setAttribute("aria-busy", String(estado));
    }
  }

  // =======================================================
  // 5. IDENTIFICAR LA DIVISIÓN
  // =======================================================

  async function configurarDivision() {
    const divisionURL = obtenerParametroDivision();

    try {
      const divisiones = await obtenerDivisionesActivas();

      const normalizar = (valor) =>
        String(valor || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();

      const divisionEncontrada = divisionURL
        ? divisiones.find(
            (item) =>
              normalizar(item.nombre) === normalizar(divisionURL) ||
              normalizar(item.id) === normalizar(divisionURL),
          )
        : null;

      divisionActual = divisionEncontrada
        ? divisionEncontrada.nombre
        : CHAT_CONFIG.DEFAULT_DIVISION;

      if (elementos.nombreDivision) {
        elementos.nombreDivision.textContent = divisionActual;
      }

      if (elementos.contextoDivision) {
        elementos.contextoDivision.hidden =
          divisionActual === CHAT_CONFIG.DEFAULT_DIVISION;
      }
    } catch (error) {
      console.error("Error al configurar la división:", error);

      divisionActual = CHAT_CONFIG.DEFAULT_DIVISION;

      if (elementos.nombreDivision) {
        elementos.nombreDivision.textContent = divisionActual;
      }

      if (elementos.contextoDivision) {
        elementos.contextoDivision.hidden = true;
      }
    }
  }

  // =======================================================
  // 6. NORMALIZAR MARKDOWN
  // =======================================================

  function normalizarMarkdown(texto) {
    return (
      String(texto || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")

        // Corrige símbolos escapados como \*\*texto\*\*
        .replace(/\\([\\`*_{}\[\]()#+.!|>-])/g, "$1")

        .trim()
    );
  }

  // =======================================================
  // 7. FORMATEAR TEXTO EN LÍNEA DE FORMA SEGURA
  // =======================================================

  function renderizarTextoEnLinea(texto, contenedor) {
    const expresion =
      /(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+`|\*[^*\n]+?\*|_[^_\n]+?_|!?)(?:)/g;

    // Reconocimiento de:
    // - Negritas: **texto**
    // - Cursivas: *texto*
    // - Código: `texto`
    // - Enlaces: [texto](https://...)

    const patron =
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+`|\*[^*\n]+?\*|_[^_\n]+?_)/g;

    let posicion = 0;
    let coincidencia;

    while ((coincidencia = patron.exec(texto)) !== null) {
      const textoAnterior = texto.slice(posicion, coincidencia.index);

      if (textoAnterior) {
        contenedor.appendChild(document.createTextNode(textoAnterior));
      }

      if (coincidencia[1] && coincidencia[2]) {
        const enlace = document.createElement("a");

        let urlValida = false;

        try {
          const url = new URL(coincidencia[2]);

          urlValida = url.protocol === "https:" || url.protocol === "http:";
        } catch {
          urlValida = false;
        }

        if (urlValida) {
          enlace.href = coincidencia[2];
          enlace.textContent = coincidencia[1];
          enlace.target = "_blank";
          enlace.rel = "noopener noreferrer";

          contenedor.appendChild(enlace);
        } else {
          contenedor.appendChild(document.createTextNode(coincidencia[0]));
        }
      } else {
        const token = coincidencia[3];

        let elemento;

        if (token.startsWith("**") || token.startsWith("__")) {
          elemento = document.createElement("strong");

          elemento.textContent = token.slice(2, -2);
        } else if (token.startsWith("`")) {
          elemento = document.createElement("code");

          elemento.textContent = token.slice(1, -1);
        } else {
          elemento = document.createElement("em");

          elemento.textContent = token.slice(1, -1);
        }

        contenedor.appendChild(elemento);
      }

      posicion = patron.lastIndex;
    }

    const textoFinal = texto.slice(posicion);

    if (textoFinal) {
      contenedor.appendChild(document.createTextNode(textoFinal));
    }
  }

  // =======================================================
  // 8. FORMATEAR RESPUESTAS COMPLETAS
  // =======================================================

  function renderizarMarkdown(texto) {
    const contenido = document.createElement("div");

    contenido.className = "texto-formateado";

    const textoNormalizado = normalizarMarkdown(texto);

    if (!textoNormalizado) {
      return contenido;
    }

    const lineas = textoNormalizado.split("\n");

    let parrafoActual = [];
    let listaActual = null;
    let tipoListaActual = null;

    // -----------------------------------------------------
    // CERRAR PÁRRAFO
    // -----------------------------------------------------

    function cerrarParrafo() {
      if (!parrafoActual.length) return;

      const parrafo = document.createElement("p");

      renderizarTextoEnLinea(parrafoActual.join(" "), parrafo);

      contenido.appendChild(parrafo);

      parrafoActual = [];
    }

    // -----------------------------------------------------
    // CERRAR LISTA
    // -----------------------------------------------------

    function cerrarLista() {
      if (!listaActual) return;

      contenido.appendChild(listaActual);

      listaActual = null;
      tipoListaActual = null;
    }

    // -----------------------------------------------------
    // PROCESAR CADA LÍNEA
    // -----------------------------------------------------

    for (const lineaOriginal of lineas) {
      const linea = lineaOriginal.trim();

      if (!linea) {
        cerrarParrafo();
        cerrarLista();
        continue;
      }

      // Títulos Markdown.
      const titulo = linea.match(/^(#{1,3})\s+(.+)$/);

      if (titulo) {
        cerrarParrafo();
        cerrarLista();

        const nivel = titulo[1].length;

        const encabezado = document.createElement(`h${nivel + 1}`);

        renderizarTextoEnLinea(titulo[2], encabezado);

        contenido.appendChild(encabezado);

        continue;
      }

      const viñeta = linea.match(/^[-*•]\s+(.+)$/);

      const numerada = linea.match(/^\d+[.)]\s+(.+)$/);

      if (viñeta || numerada) {
        cerrarParrafo();

        const tipoLista = viñeta ? "ul" : "ol";

        if (tipoListaActual !== tipoLista) {
          cerrarLista();

          listaActual = document.createElement(tipoLista);

          tipoListaActual = tipoLista;
        }

        const elemento = document.createElement("li");

        renderizarTextoEnLinea((viñeta || numerada)[1], elemento);

        listaActual.appendChild(elemento);

        continue;
      }

      cerrarLista();

      parrafoActual.push(linea);
    }

    cerrarParrafo();
    cerrarLista();

    return contenido;
  }

  // =======================================================
  // 9. CREAR MENSAJES
  // =======================================================

  function crearMensaje(texto, tipo) {
    const mensaje = document.createElement("div");

    mensaje.className = `mensaje ${tipo}`;

    const avatar = document.createElement("div");

    avatar.className =
      tipo === "usuario"
        ? "avatar avatar-usuario"
        : "avatar avatar-asistente-mensaje";

    avatar.setAttribute("aria-hidden", "true");

    avatar.textContent = tipo === "usuario" ? "T" : "A";

    const contenido = document.createElement("div");

    contenido.className = "contenido-mensaje";

    const meta = document.createElement("div");

    meta.className = "mensaje-meta";

    const nombre = document.createElement("strong");

    nombre.textContent = tipo === "usuario" ? "Tú" : "AsistIA";

    const hora = document.createElement("span");

    hora.textContent = obtenerHora();

    const burbuja = document.createElement("div");

    burbuja.className = "burbuja-mensaje";

    if (tipo === "usuario") {
      const parrafo = document.createElement("p");

      parrafo.textContent = texto;

      burbuja.appendChild(parrafo);
    } else {
      burbuja.appendChild(renderizarMarkdown(texto));
    }

    meta.append(nombre, hora);

    contenido.append(meta, burbuja);

    mensaje.append(avatar, contenido);

    return mensaje;
  }

  function agregarMensaje(texto, tipo) {
    if (!elementos.cajaMensajes) return;

    const mensaje = crearMensaje(texto, tipo);

    elementos.cajaMensajes.appendChild(mensaje);

    desplazarAlFinal();
  }

  function agregarMensajeUsuario(texto) {
    agregarMensaje(texto, "usuario");
  }

  function agregarMensajeAsistente(texto) {
    agregarMensaje(texto, "asistente");
  }

  // =======================================================
  // 10. CONSULTAR EL SERVIDOR
  // =======================================================

  async function consultarAsistente(mensaje) {
    controladorPeticion = new AbortController();

    const temporizador = setTimeout(() => {
      controladorPeticion?.abort();
    }, CHAT_CONFIG.REQUEST_TIMEOUT);

    try {
      const respuesta = await fetch(CHAT_CONFIG.API_URL, {
        method: CHAT_CONFIG.METHOD,

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        credentials: "same-origin",

        signal: controladorPeticion.signal,

        body: JSON.stringify({
          mensaje,
          division: divisionActual,
          historial: historialConversacion,
        }),
      });

      let resultado;

      try {
        resultado = await respuesta.json();
      } catch {
        throw new Error(
          "El servidor devolvió una respuesta que no se pudo interpretar.",
        );
      }

      if (!respuesta.ok) {
        throw new Error(
          resultado?.mensaje ||
            resultado?.error ||
            "No fue posible procesar tu consulta.",
        );
      }

      if (
        !resultado ||
        typeof resultado.respuesta !== "string" ||
        !resultado.respuesta.trim()
      ) {
        throw new Error("El asistente no recibió una respuesta válida.");
      }

      return resultado.respuesta.trim();
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("La consulta tardó demasiado. Intenta nuevamente.");
      }

      if (error instanceof TypeError) {
        throw new Error(
          "No fue posible conectar con AsistIA. Verifica tu conexión e inténtalo de nuevo.",
        );
      }

      throw error;
    } finally {
      clearTimeout(temporizador);

      controladorPeticion = null;
    }
  }

  // =======================================================
  // 11. ENVIAR MENSAJES
  // =======================================================

  async function enviarMensaje(texto) {
    const mensaje = normalizarTexto(texto);

    if (enviando || !mensaje) return;

    if (mensaje.length > CHAT_CONFIG.MAX_MESSAGE_LENGTH) {
      agregarMensajeAsistente(
        `Tu consulta supera el límite de ${CHAT_CONFIG.MAX_MESSAGE_LENGTH} caracteres. Por favor, intenta resumirla.`,
      );

      return;
    }

    if (!elementos.cajaMensajes) return;

    agregarMensajeUsuario(mensaje);

    if (elementos.entrada) {
      elementos.entrada.value = "";
    }

    establecerEstadoEnvio(true);

    mostrarIndicador(true);

    try {
      const respuesta = await consultarAsistente(mensaje);

      // Guardar el intercambio únicamente cuando la respuesta
      // del servidor se haya recibido correctamente.
      historialConversacion.push(
        {
          role: "user",
          content: mensaje,
        },
        {
          role: "assistant",
          content: respuesta,
        },
      );

      // Conservar solamente los últimos 12 mensajes.
      if (historialConversacion.length > MAX_MENSAJES_HISTORIAL) {
        historialConversacion = historialConversacion.slice(
          -MAX_MENSAJES_HISTORIAL,
        );
      }

      agregarMensajeAsistente(respuesta);
    } catch (error) {
      console.error("Error en el chat de AsistIA:", error);

      agregarMensajeAsistente(
        error.message ||
          "Ocurrió un inconveniente al procesar tu consulta. Intenta nuevamente.",
      );
    } finally {
      mostrarIndicador(false);

      establecerEstadoEnvio(false);

      if (elementos.entrada) {
        elementos.entrada.focus();
      }
    }
  }

  // =======================================================
  // 12. FORMULARIO DE ENVÍO
  // =======================================================

  function configurarFormulario() {
    if (!elementos.formulario || !elementos.entrada) {
      return;
    }

    elementos.botonEnviar = elementos.formulario.querySelector(
      'button[type="submit"], button:not([type])',
    );

    elementos.formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();

      const mensaje = elementos.entrada.value;

      enviarMensaje(mensaje);
    });
  }

  // =======================================================
  // 13. CONSULTAS FRECUENTES
  // =======================================================

  function configurarSugerencias() {
    elementos.sugerencias.forEach((boton) => {
      boton.addEventListener("click", () => {
        if (enviando || !elementos.entrada) {
          return;
        }

        const consulta = normalizarTexto(boton.textContent);

        if (!consulta) return;

        elementos.entrada.value = consulta;

        elementos.entrada.focus();
      });
    });
  }

  // =======================================================
  // 14. INICIALIZACIÓN
  // =======================================================

  async function iniciar() {
    if (
      !elementos.cajaMensajes ||
      !elementos.formulario ||
      !elementos.entrada
    ) {
      return;
    }

    await configurarDivision();

    configurarFormulario();

    configurarSugerencias();

    mostrarIndicador(false);

    console.info("AsistIA: sistema de chat inicializado.");
  }

  return {
    iniciar,
    enviarMensaje,
    agregarMensajeUsuario,
    agregarMensajeAsistente,
  };
})();

// =========================================================
// 15. ARRANCAR CUANDO CARGUE EL DOCUMENTO
// =========================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Chat.iniciar);
} else {
  Chat.iniciar();
}
