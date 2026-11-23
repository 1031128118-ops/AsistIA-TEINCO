/* =========================================================
   ASISTIA — TEINCO
   PANEL ADMINISTRATIVO DE REPORTES
   Archivo: js/admin-reportes.js
========================================================= */

"use strict";

// =========================================================
// 1. CONFIGURACIÓN
// =========================================================

const REPORTES_CONFIG = Object.freeze({
  API_URL: "/api/admin/reportes",
  METHOD: "GET",
  TIMEOUT: 20000,

  DIVISIONES: [
    "Admisiones",
    "Registro y Control",
    "Bienestar Institucional",
    "Coordinación Académica",
  ],
});

// =========================================================
// 2. ELEMENTOS DEL DOCUMENTO
// =========================================================

const Reportes = (() => {
  const elementos = {
    totalConsultas: document.getElementById("total-consultas"),
    totalRespuestas: document.getElementById("total-respuestas"),
    divisionPopular: document.getElementById("division-popular"),
    consultasSinRespuesta: document.getElementById("consultas-sin-respuesta"),

    graficoLineas: document.getElementById("grafico-lineas"),
    graficoBarras: document.getElementById("grafico-barras"),

    estadoLineas: document.getElementById("estado-grafico-lineas"),
    estadoBarras: document.getElementById("estado-grafico-barras"),

    cuerpoTabla: document.getElementById("cuerpo-tabla"),
    totalRegistros: document.getElementById("total-registros"),

    filtroDivision: document.getElementById("filtro-division"),
    botonActualizar: document.getElementById("btn-actualizar"),

    botonExportar: document.getElementById("btn-descargar"),
  };

  // =======================================================
  // 3. ESTADO
  // =======================================================

  let datosReporte = {
    estadisticas: {},
    actividad: [],
    divisiones: [],
    conversaciones: [],
  };

  let graficoActividad = null;
  let graficoDivisiones = null;
  let cargando = false;

  // =======================================================
  // 4. UTILIDADES
  // =======================================================

  function obtenerElemento(id) {
    return document.getElementById(id);
  }

  function establecerTexto(elemento, valor) {
    if (!elemento) return;

    elemento.textContent =
      valor === null || valor === undefined || valor === ""
        ? "—"
        : String(valor);
  }

  function formatearNumero(valor) {
    const numero = Number(valor);

    if (!Number.isFinite(numero)) return "—";

    return new Intl.NumberFormat("es-CO").format(numero);
  }

  function protegerValorCSV(valor) {
    let texto = String(valor ?? "");

    // Evitar que Excel interprete datos como fórmulas.
    if (/^[\s\u0000-\u001F]*[=+\-@]/.test(texto)) {
      texto = "'" + texto;
    }

    return texto;
  }

  function escaparCSV(valor) {
    const texto = protegerValorCSV(valor);

    return `"${texto.replace(/"/g, '""')}"`;
  }

  function obtenerFecha(fecha) {
    if (!fecha) return "—";

    const valor = new Date(fecha);

    if (Number.isNaN(valor.getTime())) {
      return String(fecha);
    }

    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(valor);
  }

  function normalizarEstado(estado) {
    const valor = String(estado || "").toLowerCase();

    if (["respondida", "completada", "resuelta", "correcta"].includes(valor)) {
      return "Respondida";
    }

    if (["sin respuesta", "pendiente", "error", "fallida"].includes(valor)) {
      return "Sin respuesta";
    }

    return estado || "Sin información";
  }

  function establecerEstadoGrafico(elemento, mensaje) {
    if (!elemento) return;

    elemento.textContent = mensaje;
  }

  // =======================================================
  // 5. CONSULTAR EL BACKEND
  // =======================================================

  async function solicitarReportes() {
    const controlador = new AbortController();

    const temporizador = setTimeout(() => {
      controlador.abort();
    }, REPORTES_CONFIG.TIMEOUT);

    try {
      const respuesta = await fetch(REPORTES_CONFIG.API_URL, {
        method: REPORTES_CONFIG.METHOD,

        headers: {
          Accept: "application/json",
        },

        credentials: "same-origin",

        signal: controlador.signal,
      });

      let resultado;

      try {
        resultado = await respuesta.json();
      } catch {
        throw new Error("El servidor devolvió una respuesta no válida.");
      }

      if (!respuesta.ok) {
        throw new Error(
          resultado?.mensaje ||
            resultado?.error ||
            "No fue posible obtener los reportes.",
        );
      }

      return resultado;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("La consulta de reportes superó el tiempo permitido.");
      }

      if (error instanceof TypeError) {
        throw new Error("No fue posible conectar con el servidor de reportes.");
      }

      throw error;
    } finally {
      clearTimeout(temporizador);
    }
  }

  // =======================================================
  // 6. NORMALIZAR DATOS RECIBIDOS
  // =======================================================

  function normalizarDatos(resultado) {
    const datos = resultado?.data || resultado || {};

    return {
      estadisticas: datos.estadisticas || {},

      actividad: Array.isArray(datos.actividad) ? datos.actividad : [],

      divisiones: Array.isArray(datos.divisiones) ? datos.divisiones : [],

      conversaciones: Array.isArray(datos.conversaciones)
        ? datos.conversaciones
        : [],
    };
  }

  // =======================================================
  // 7. ACTUALIZAR INDICADORES
  // =======================================================

  function actualizarIndicadores() {
    const estadisticas = datosReporte.estadisticas;

    establecerTexto(
      elementos.totalConsultas,
      formatearNumero(estadisticas.totalConsultas),
    );

    establecerTexto(
      elementos.totalRespuestas,
      formatearNumero(estadisticas.totalRespuestas),
    );

    establecerTexto(
      elementos.divisionPopular,
      estadisticas.divisionPopular || "—",
    );

    establecerTexto(
      elementos.consultasSinRespuesta,
      formatearNumero(estadisticas.consultasSinRespuesta),
    );
  }

  // =======================================================
  // 8. GRÁFICA DE ACTIVIDAD
  // =======================================================

  function actualizarGraficoActividad() {
    if (!elementos.graficoLineas) return;

    if (typeof Chart === "undefined") {
      establecerEstadoGrafico(
        elementos.estadoLineas,
        "No se pudo cargar la biblioteca de gráficas.",
      );

      return;
    }

    const etiquetas = datosReporte.actividad.map(
      (item) => item.fecha || item.etiqueta || "",
    );

    const valores = datosReporte.actividad.map((item) =>
      Number(item.total ?? item.consultas ?? 0),
    );

    if (graficoActividad) {
      graficoActividad.destroy();
    }

    graficoActividad = new Chart(elementos.graficoLineas, {
      type: "line",

      data: {
        labels: etiquetas,

        datasets: [
          {
            label: "Consultas",
            data: valores,

            borderColor: "#a78bfa",
            backgroundColor: "rgba(139, 92, 246, 0.15)",

            borderWidth: 3,
            tension: 0.35,
            fill: true,

            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#c4b5fd",
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
          intersect: false,
          mode: "index",
        },

        plugins: {
          legend: {
            labels: {
              color: "#c9c6e8",
              usePointStyle: true,
            },
          },
        },

        scales: {
          x: {
            ticks: {
              color: "#9293b2",
            },

            grid: {
              color: "rgba(167, 139, 250, 0.08)",
            },
          },

          y: {
            beginAtZero: true,

            ticks: {
              precision: 0,
              color: "#9293b2",
            },

            grid: {
              color: "rgba(167, 139, 250, 0.08)",
            },
          },
        },
      },
    });

    establecerEstadoGrafico(
      elementos.estadoLineas,
      datosReporte.actividad.length
        ? "Actividad registrada en el periodo consultado."
        : "No hay datos de actividad disponibles.",
    );
  }

  // =======================================================
  // 9. GRÁFICA POR DIVISIONES
  // =======================================================

  function actualizarGraficoDivisiones() {
    if (!elementos.graficoBarras) return;

    if (typeof Chart === "undefined") {
      establecerEstadoGrafico(
        elementos.estadoBarras,
        "No se pudo cargar la biblioteca de gráficas.",
      );

      return;
    }

    const etiquetas = datosReporte.divisiones.map(
      (item) => item.nombre || item.division || "Sin nombre",
    );

    const valores = datosReporte.divisiones.map((item) =>
      Number(item.total ?? item.consultas ?? 0),
    );

    if (graficoDivisiones) {
      graficoDivisiones.destroy();
    }

    graficoDivisiones = new Chart(elementos.graficoBarras, {
      type: "bar",

      data: {
        labels: etiquetas,

        datasets: [
          {
            label: "Consultas",
            data: valores,

            backgroundColor: [
              "rgba(167, 139, 250, 0.78)",
              "rgba(129, 140, 248, 0.78)",
              "rgba(99, 102, 241, 0.78)",
              "rgba(139, 92, 246, 0.78)",
            ],

            borderColor: ["#a78bfa", "#818cf8", "#6366f1", "#8b5cf6"],

            borderWidth: 1,
            borderRadius: 8,
            maxBarThickness: 48,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            display: false,
          },
        },

        scales: {
          x: {
            ticks: {
              color: "#9293b2",
            },

            grid: {
              display: false,
            },
          },

          y: {
            beginAtZero: true,

            ticks: {
              precision: 0,
              color: "#9293b2",
            },

            grid: {
              color: "rgba(167, 139, 250, 0.08)",
            },
          },
        },
      },
    });

    establecerEstadoGrafico(
      elementos.estadoBarras,
      datosReporte.divisiones.length
        ? "Distribución de consultas por división."
        : "No hay datos por división disponibles.",
    );
  }

  // =======================================================
  // 10. TABLA DE CONVERSACIONES
  // =======================================================

  function crearCelda(valor) {
    const celda = document.createElement("td");

    celda.textContent =
      valor === null || valor === undefined || valor === ""
        ? "—"
        : String(valor);

    return celda;
  }

  function mostrarTablaVacia(mensaje) {
    if (!elementos.cuerpoTabla) return;

    elementos.cuerpoTabla.replaceChildren();

    const fila = document.createElement("tr");
    fila.className = "fila-vacia";

    const celda = document.createElement("td");
    celda.colSpan = 5;

    const contenedor = document.createElement("div");
    contenedor.className = "estado-vacio";

    const titulo = document.createElement("strong");
    titulo.textContent = mensaje;

    const descripcion = document.createElement("span");
    descripcion.textContent =
      "Los registros aparecerán aquí cuando existan datos disponibles.";

    contenedor.append(titulo, descripcion);
    celda.appendChild(contenedor);
    fila.appendChild(celda);

    elementos.cuerpoTabla.appendChild(fila);

    establecerTexto(elementos.totalRegistros, "0 registros");
  }

  function renderizarTabla(conversaciones) {
    if (!elementos.cuerpoTabla) return;

    elementos.cuerpoTabla.replaceChildren();

    if (!conversaciones.length) {
      mostrarTablaVacia("No hay conversaciones para mostrar");
      return;
    }

    const fragmento = document.createDocumentFragment();

    conversaciones.forEach((conversacion) => {
      const fila = document.createElement("tr");

      const fecha = obtenerFecha(conversacion.fecha || conversacion.createdAt);

      const consulta = conversacion.consulta || conversacion.mensaje || "—";

      const division = conversacion.division || "—";

      const estado = normalizarEstado(conversacion.estado);

      const respuesta = conversacion.respuesta || "—";

      fila.append(
        crearCelda(fecha),
        crearCelda(consulta),
        crearCelda(division),
        crearCelda(estado),
        crearCelda(respuesta),
      );

      fragmento.appendChild(fila);
    });

    elementos.cuerpoTabla.appendChild(fragmento);

    establecerTexto(
      elementos.totalRegistros,
      `${conversaciones.length} registros`,
    );
  }

  // =======================================================
  // 11. FILTRAR CONVERSACIONES
  // =======================================================

  function obtenerConversacionesFiltradas() {
    const division = elementos.filtroDivision?.value || "";

    if (!division) {
      return datosReporte.conversaciones;
    }

    return datosReporte.conversaciones.filter(
      (conversacion) => conversacion.division === division,
    );
  }

  function aplicarFiltro() {
    renderizarTabla(obtenerConversacionesFiltradas());
  }

  // =======================================================
  // 12. EXPORTAR CSV
  // =======================================================

  function exportarCSV() {
    const conversaciones = obtenerConversacionesFiltradas();

    if (!conversaciones.length) {
      alert("No hay conversaciones disponibles para exportar.");
      return;
    }

    const separador = ";";

    // -------------------------------------------------------
    // UTILIDADES
    // -------------------------------------------------------

    function filaCSV(valores) {
      return valores.map(escaparCSV).join(separador);
    }

    function agregarSeccion(filas, titulo) {
      filas.push([]);
      filas.push([titulo]);
    }

    const fechaGeneracion = new Intl.DateTimeFormat("es-CO", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());

    const estadisticas = datosReporte.estadisticas;

    const totalConsultas = Number(estadisticas.totalConsultas) || 0;
    const totalRespuestas = Number(estadisticas.totalRespuestas) || 0;
    const consultasSinRespuesta =
      Number(estadisticas.consultasSinRespuesta) || 0;

    const divisionPopular = estadisticas.divisionPopular || "Sin registros";

    const totalFiltrado = conversaciones.length;

    const respuestasFiltradas = conversaciones.filter(
      (item) => item.respuesta && String(item.respuesta).trim() !== "",
    ).length;

    const pendientesFiltradas = totalFiltrado - respuestasFiltradas;

    // -------------------------------------------------------
    // CONSTRUIR REPORTE
    // -------------------------------------------------------

    const filas = [];

    // ENCABEZADO INSTITUCIONAL

    filas.push(["ASISTIA — TEINCO"]);
    filas.push(["REPORTE DE ACTIVIDAD INSTITUCIONAL"]);
    filas.push(["Corporación Tecnológica Industrial Colombiana"]);
    filas.push(["Fecha de generación", fechaGeneracion]);

    filas.push([
      "Filtro aplicado",
      elementos.filtroDivision?.value || "Todas las divisiones",
    ]);

    // RESUMEN GENERAL

    agregarSeccion(filas, "1. RESUMEN GENERAL");

    filas.push(["Indicador", "Resultado"]);

    filas.push(["Total de consultas", totalConsultas]);

    filas.push(["Respuestas generadas", totalRespuestas]);

    filas.push(["Consultas sin respuesta", consultasSinRespuesta]);

    filas.push(["División más consultada", divisionPopular]);

    // RESUMEN DEL FILTRO

    agregarSeccion(filas, "2. RESUMEN DE CONVERSACIONES EXPORTADAS");

    filas.push(["Indicador", "Resultado"]);

    filas.push(["Registros exportados", totalFiltrado]);

    filas.push(["Respuestas registradas", respuestasFiltradas]);

    filas.push(["Registros sin respuesta", pendientesFiltradas]);

    // DISTRIBUCIÓN POR DIVISIONES

    agregarSeccion(filas, "3. DISTRIBUCIÓN POR DIVISIONES");

    filas.push(["División", "Total de consultas"]);

    // El backend ya proporciona todas las divisiones,
    // incluida General. No volver a calcularla desde
    // las conversaciones para evitar duplicados.

    datosReporte.divisiones.forEach((division) => {
      filas.push([
        division.nombre || division.division || "Sin identificar",
        Number(division.total ?? division.consultas ?? 0),
      ]);
    });

    // HISTORIAL DETALLADO

    agregarSeccion(filas, "4. HISTORIAL DETALLADO DE CONVERSACIONES");

    filas.push(["Fecha y hora", "Consulta", "División", "Estado", "Respuesta"]);

    conversaciones.forEach((conversacion) => {
      filas.push([
        obtenerFecha(conversacion.fecha || conversacion.createdAt),

        conversacion.consulta || conversacion.mensaje || "",

        conversacion.division || "General",

        normalizarEstado(conversacion.estado),

        conversacion.respuesta || "",
      ]);
    });

    // PIE INSTITUCIONAL

    agregarSeccion(filas, "FIN DEL REPORTE");

    filas.push(["Documento generado automáticamente por AsistIA — TEINCO."]);

    filas.push([
      "Los datos corresponden a los registros disponibles en PostgreSQL.",
    ]);

    // -------------------------------------------------------
    // GENERAR ARCHIVO CSV
    // -------------------------------------------------------

    const contenido = filas.map((fila) => filaCSV(fila)).join("\r\n");

    // BOM UTF-8 para conservar caracteres especiales en Excel.
    const archivo = new Blob(["\uFEFF", contenido], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(archivo);

    const enlace = document.createElement("a");

    const fechaArchivo = new Date().toISOString().slice(0, 10);

    enlace.href = url;

    enlace.download = `AsistIA_TEINCO_Reporte_${fechaArchivo}.csv`;

    document.body.appendChild(enlace);

    enlace.click();

    enlace.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    console.info("[ASISTIA - REPORTES] Archivo CSV generado correctamente.");
  }

  // =======================================================
  // 13. CARGAR Y ACTUALIZAR REPORTES
  // =======================================================

  async function cargarReportes() {
    if (cargando) return;

    cargando = true;

    if (elementos.botonActualizar) {
      elementos.botonActualizar.disabled = true;
    }

    establecerEstadoGrafico(elementos.estadoLineas, "Cargando información...");

    establecerEstadoGrafico(elementos.estadoBarras, "Cargando información...");

    try {
      const resultado = await solicitarReportes();

      datosReporte = normalizarDatos(resultado);

      actualizarIndicadores();
      actualizarGraficoActividad();
      actualizarGraficoDivisiones();
      aplicarFiltro();

      console.info("AsistIA: reportes actualizados.");
    } catch (error) {
      console.error("Error al cargar reportes:", error);

      establecerEstadoGrafico(elementos.estadoLineas, error.message);

      establecerEstadoGrafico(elementos.estadoBarras, error.message);

      mostrarTablaVacia("No fue posible cargar los registros");
    } finally {
      cargando = false;

      if (elementos.botonActualizar) {
        elementos.botonActualizar.disabled = false;
      }
    }
  }

  // =======================================================
  // 14. EVENTOS
  // =======================================================

  function configurarEventos() {
    elementos.botonActualizar?.addEventListener("click", cargarReportes);

    elementos.filtroDivision?.addEventListener("change", aplicarFiltro);

    elementos.botonExportar?.addEventListener("click", exportarCSV);
  }

  // =======================================================
  // 15. INICIALIZACIÓN
  // =======================================================

  function iniciar() {
    configurarEventos();

    if (typeof Chart === "undefined") {
      console.warn("AsistIA: Chart.js no está disponible.");
    }

    cargarReportes();
  }

  return {
    iniciar,
    cargarReportes,
    exportarCSV,
  };
})();

// =========================================================
// 16. ARRANCAR EL PANEL
// =========================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Reportes.iniciar);
} else {
  Reportes.iniciar();
}
