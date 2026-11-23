/* =========================================================
   ASISTIA — TEINCO
   GESTIÓN ADMINISTRATIVA DE DIVISIONES
   Archivo: public/js/admin-divisiones.js
========================================================= */

"use strict";

(() => {
  // =====================================================
  // CONFIGURACIÓN
  // =====================================================

  const CONFIG = Object.freeze({
    API_DIVISIONES: "/api/admin/divisiones",
    API_DOCUMENTOS: "/api/admin/documentos",
    API_LOGOUT: "/api/auth/logout",
    TIMEOUT: 20000,
  });

  // =====================================================
  // ELEMENTOS DEL HTML
  // =====================================================

  const elementos = {
    fecha: document.getElementById("fecha-actual"),

    total: document.getElementById("total-divisiones"),
    activas: document.getElementById("divisiones-activas"),
    inactivas: document.getElementById("divisiones-inactivas"),
    documentos: document.getElementById("total-documentos"),

    buscador: document.getElementById("buscar-division"),
    filtroEstado: document.getElementById("filtro-estado"),

    listaDivisiones: document.getElementById("lista-divisiones"),
    estadoVacio: document.getElementById("estado-vacio-divisiones"),

    btnNueva: document.getElementById("btn-nueva-division"),
    btnActualizar: document.getElementById("btn-actualizar-divisiones"),

    filtroDocumentos: document.getElementById("filtro-documentos"),
    btnSubirDocumento: document.getElementById("btn-subir-documento"),

    cuerpoDocumentos: document.getElementById("cuerpo-tabla-documentos"),
    totalDocumentosTabla: document.getElementById("total-documentos-tabla"),

    btnCerrarSesion: document.getElementById("btn-cerrar-sesion"),
  };

  // =====================================================
  // ESTADO
  // =====================================================

  let divisiones = [];
  let documentos = [];
  let cargando = false;
  let modalAbierto = false;

  // =====================================================
  // ESTILOS INSTITUCIONALES
  // =====================================================

  function inyectarEstilos() {
    if (document.getElementById("asistia-ui-estilos")) return;

    const estilos = document.createElement("style");
    estilos.id = "asistia-ui-estilos";

    estilos.textContent = `
      .asistia-modal {
        box-sizing: border-box;
        width: min(540px, calc(100% - 30px));
        max-width: 540px;
        max-height: min(88vh, 760px);
        padding: 0;
        overflow: auto;
        border: 1px solid rgba(151,119,255,.34);
        border-radius: 20px;
        background: #111225;
        color: #f4f2ff;
        box-shadow: 0 28px 90px rgba(0,0,0,.58);
        font-family: "DM Sans", "Manrope", sans-serif;
      }

      .asistia-modal::backdrop {
        background: rgba(4,5,17,.78);
        backdrop-filter: blur(7px);
      }

      .asistia-modal-contenido {
        padding: 28px;
      }

      .asistia-modal-encabezado {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 25px;
      }

      .asistia-modal-etiqueta {
        display: block;
        margin-bottom: 8px;
        color: #ad98ff;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1.8px;
        text-transform: uppercase;
      }

      .asistia-modal-titulo {
        margin: 0;
        color: #fff;
        font-size: 21px;
        line-height: 1.3;
        font-weight: 700;
      }

      .asistia-modal-descripcion {
        margin: 8px 0 0;
        color: #a5a7c0;
        font-size: 12px;
        line-height: 1.65;
      }

      .asistia-modal-cerrar {
        display: grid;
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        place-items: center;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 10px;
        background: #1a1b35;
        color: #d5caff;
        font-size: 21px;
        cursor: pointer;
      }

      .asistia-modal-campo {
        display: block;
        margin: 0 0 18px;
      }

      .asistia-modal-campo > span {
        display: block;
        margin-bottom: 8px;
        color: #dedcf0;
        font-size: 12px;
        font-weight: 600;
      }

      .asistia-modal-campo input,
      .asistia-modal-campo textarea,
      .asistia-modal-campo select {
        box-sizing: border-box;
        display: block;
        width: 100%;
        min-height: 44px;
        padding: 11px 13px;
        border: 1px solid #303153;
        border-radius: 11px;
        outline: none;
        background: #0c0d1d;
        color: #f4f2ff;
        font: inherit;
        font-size: 13px;
        transition: border-color .2s, box-shadow .2s;
      }

      .asistia-modal-campo textarea {
        min-height: 112px;
        resize: vertical;
        line-height: 1.6;
      }

      .asistia-modal-campo input:focus,
      .asistia-modal-campo textarea:focus,
      .asistia-modal-campo select:focus {
        border-color: #9875ff;
        box-shadow: 0 0 0 3px rgba(152,117,255,.13);
      }

      .asistia-modal-campo input[type="file"] {
        padding: 10px;
      }

      .asistia-modal-ayuda {
        margin: 8px 0 0;
        color: #8588a8;
        font-size: 11px;
        line-height: 1.5;
      }

      .asistia-modal-detalles {
        display: grid;
        gap: 12px;
      }

      .asistia-modal-detalle {
        padding: 13px 14px;
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 12px;
        background: rgba(255,255,255,.025);
      }

      .asistia-modal-detalle small {
        display: block;
        margin-bottom: 6px;
        color: #a995ff;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
      }

      .asistia-modal-detalle p {
        margin: 0;
        color: #e8e6f7;
        font-size: 13px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }

      .asistia-modal-estado {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        width: fit-content;
        padding: 6px 10px;
        border: 1px solid rgba(65,211,157,.2);
        border-radius: 30px;
        background: rgba(65,211,157,.08);
        color: #80e7bd;
        font-size: 11px;
        font-weight: 700;
      }

      .asistia-modal-estado.inactiva {
        border-color: rgba(255,174,93,.2);
        background: rgba(255,174,93,.08);
        color: #ffc17d;
      }

      .asistia-modal-acciones {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 25px;
        padding-top: 19px;
        border-top: 1px solid rgba(255,255,255,.08);
      }

      .asistia-modal-boton {
        min-height: 42px;
        padding: 0 18px;
        border-radius: 10px;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: transform .2s, filter .2s, opacity .2s;
      }

      .asistia-modal-cancelar {
        border: 1px solid #343553;
        background: #1a1b35;
        color: #d2d0e5;
      }

      .asistia-modal-guardar {
        border: 1px solid #8060ed;
        background: linear-gradient(135deg,#8059e8,#5942c5);
        color: #fff;
      }

      .asistia-modal-peligro {
        border: 1px solid rgba(255,112,130,.35);
        background: rgba(255,112,130,.12);
        color: #ff9eaa;
      }
              .asistia-modal-boton:hover {
        transform: translateY(-1px);
        filter: brightness(1.12);
      }

      .asistia-modal-boton:disabled {
        opacity: .55;
        cursor: wait;
        transform: none;
      }

      .asistia-toast-contenedor {
        position: fixed;
        z-index: 100000;
        top: 22px;
        right: 22px;
        display: grid;
        gap: 10px;
        width: min(370px, calc(100% - 32px));
        pointer-events: none;
      }

      .asistia-toast {
        display: flex;
        align-items: flex-start;
        gap: 11px;
        padding: 15px 17px;
        border: 1px solid rgba(151,119,255,.28);
        border-radius: 13px;
        background: #15162d;
        color: #f4f2ff;
        box-shadow: 0 14px 40px rgba(0,0,0,.38);
        font-family: "DM Sans", "Manrope", sans-serif;
        font-size: 12px;
        line-height: 1.55;
        animation: asistia-toast-entrada .22s ease-out;
        pointer-events: auto;
      }

      .asistia-toast.exito { border-color: rgba(65,211,157,.35); }
      .asistia-toast.error { border-color: rgba(255,112,130,.38); }
      .asistia-toast.aviso { border-color: rgba(255,190,100,.35); }

      .asistia-toast-icono {
        display: grid;
        flex: 0 0 23px;
        width: 23px;
        height: 23px;
        place-items: center;
        border-radius: 8px;
        background: rgba(151,119,255,.15);
        color: #c5b4ff;
        font-weight: 800;
      }

      .asistia-toast.exito .asistia-toast-icono { color: #80e7bd; }
      .asistia-toast.error .asistia-toast-icono { color: #ff9eaa; }
      .asistia-toast.aviso .asistia-toast-icono { color: #ffc17d; }

      @keyframes asistia-toast-entrada {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (max-width: 480px) {
        .asistia-modal-contenido { padding: 21px; }
        .asistia-modal-acciones { flex-direction: column-reverse; }
        .asistia-modal-boton { width: 100%; }
        .asistia-toast-contenedor {
          top: 12px;
          right: 12px;
          width: calc(100% - 24px);
        }
      }
    `;

    document.head.appendChild(estilos);
  }

  // =====================================================
  // UTILIDADES GENERALES
  // =====================================================

  function normalizarTexto(valor) {
    return String(valor ?? "").trim();
  }

  function normalizarEstado(valor) {
    const estado = normalizarTexto(valor).toLowerCase();

    if (estado === "activo" || estado === "activa" || estado === "true") {
      return "activa";
    }

    return "inactiva";
  }

  function obtenerId(division) {
    return String(division.id ?? division._id ?? division.codigo ?? "");
  }

  function obtenerNombre(division) {
    return normalizarTexto(division.nombre ?? division.name);
  }

  function obtenerDescripcion(division) {
    return normalizarTexto(division.descripcion ?? division.description);
  }

  function formatearNumero(numero) {
    return Number(numero || 0).toLocaleString("es-CO");
  }

  function establecerTexto(elemento, valor) {
    if (elemento) elemento.textContent = valor;
  }

  function establecerFecha() {
    if (!elementos.fecha) return;

    elementos.fecha.textContent = new Intl.DateTimeFormat("es-CO", {
      dateStyle: "full",
    }).format(new Date());
  }

  function escaparHTML(valor) {
    return String(valor ?? "").replace(
      /[&<>"']/g,
      (caracter) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[caracter],
    );
  }

  // =====================================================
  // NOTIFICACIONES PERSONALIZADAS
  // =====================================================

  function mostrarAviso(mensaje, tipo = "aviso", duracion = 4200) {
    inyectarEstilos();

    let contenedor = document.querySelector(".asistia-toast-contenedor");

    if (!contenedor) {
      contenedor = document.createElement("div");
      contenedor.className = "asistia-toast-contenedor";
      contenedor.setAttribute("aria-live", "polite");
      document.body.appendChild(contenedor);
    }

    const iconos = {
      exito: "✓",
      error: "!",
      aviso: "i",
    };

    const toast = document.createElement("div");
    toast.className = `asistia-toast ${tipo}`;

    const icono = document.createElement("span");
    icono.className = "asistia-toast-icono";
    icono.textContent = iconos[tipo] || "i";

    const texto = document.createElement("div");
    texto.textContent = mensaje;

    toast.append(icono, texto);
    contenedor.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
      if (!contenedor.children.length) contenedor.remove();
    }, duracion);
  }

  // =====================================================
  // MODALES PERSONALIZADOS
  // =====================================================

  function crearModal({ titulo, descripcion = "", contenido = "" }) {
    inyectarEstilos();

    if (modalAbierto) return null;

    modalAbierto = true;

    const modal = document.createElement("dialog");
    modal.className = "asistia-modal";

    const encabezado = document.createElement("div");
    encabezado.className = "asistia-modal-encabezado";

    const bloqueTitulo = document.createElement("div");

    const etiqueta = document.createElement("span");
    etiqueta.className = "asistia-modal-etiqueta";
    etiqueta.textContent = "Administración institucional";

    const tituloElemento = document.createElement("h2");
    tituloElemento.className = "asistia-modal-titulo";
    tituloElemento.textContent = titulo;

    const descripcionElemento = document.createElement("p");
    descripcionElemento.className = "asistia-modal-descripcion";
    descripcionElemento.textContent = descripcion;

    bloqueTitulo.append(etiqueta, tituloElemento);
    if (descripcion) bloqueTitulo.appendChild(descripcionElemento);

    const cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.className = "asistia-modal-cerrar";
    cerrar.setAttribute("aria-label", "Cerrar ventana");
    cerrar.textContent = "×";

    encabezado.append(bloqueTitulo, cerrar);

    const contenidoElemento = document.createElement("div");
    contenidoElemento.className = "asistia-modal-contenido";
    contenidoElemento.appendChild(encabezado);

    if (contenido instanceof Node) {
      contenidoElemento.appendChild(contenido);
    } else {
      const fragmento = document.createElement("div");
      fragmento.innerHTML = contenido;
      contenidoElemento.appendChild(fragmento);
    }

    modal.appendChild(contenidoElemento);

    const cerrarModal = () => {
      if (modal.open) modal.close();
    };

    cerrar.addEventListener("click", cerrarModal);

    modal.addEventListener("click", (evento) => {
      if (evento.target === modal) cerrarModal();
    });

    modal.addEventListener("cancel", (evento) => {
      evento.preventDefault();
      cerrarModal();
    });

    modal.addEventListener(
      "close",
      () => {
        modal.remove();
        modalAbierto = false;
      },
      { once: true },
    );

    document.body.appendChild(modal);
    modal.showModal();

    return {
      modal,
      contenido: contenidoElemento,
      cerrar: cerrarModal,
    };
  }

  function confirmarAccion({
    titulo,
    descripcion,
    textoConfirmar = "Confirmar",
    peligro = false,
  }) {
    return new Promise((resolve) => {
      const acciones = document.createElement("div");
      acciones.className = "asistia-modal-acciones";

      const cancelar = document.createElement("button");
      cancelar.type = "button";
      cancelar.className = "asistia-modal-boton asistia-modal-cancelar";
      cancelar.textContent = "Cancelar";

      const confirmar = document.createElement("button");
      confirmar.type = "button";
      confirmar.className = `asistia-modal-boton ${
        peligro ? "asistia-modal-peligro" : "asistia-modal-guardar"
      }`;
      confirmar.textContent = textoConfirmar;

      acciones.append(cancelar, confirmar);

      const modal = crearModal({
        titulo,
        descripcion,
        contenido: acciones,
      });

      if (!modal) {
        resolve(false);
        return;
      }

      let resultado = false;

      cancelar.addEventListener("click", () => modal.cerrar());
      confirmar.addEventListener("click", () => {
        resultado = true;
        modal.cerrar();
      });

      modal.modal.addEventListener("close", () => resolve(resultado), {
        once: true,
      });
    });
  }

  // =====================================================
  // SOLICITUDES HTTP
  // =====================================================

  async function solicitar(url, opciones = {}) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), CONFIG.TIMEOUT);

    try {
      const esFormData = opciones.body instanceof FormData;

      const respuesta = await fetch(url, {
        ...opciones,
        credentials: "same-origin",
        signal: controlador.signal,
        headers: {
          ...(esFormData ? {} : { "Content-Type": "application/json" }),
          ...opciones.headers,
        },
      });

      const tipo = respuesta.headers.get("content-type") || "";
      const resultado = tipo.includes("application/json")
        ? await respuesta.json()
        : null;

      if (!respuesta.ok) {
        throw new Error(
          resultado?.mensaje ||
            resultado?.message ||
            `Error del servidor (${respuesta.status}).`,
        );
      }

      return resultado?.data ?? resultado;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("La solicitud tardó demasiado. Intenta nuevamente.");
      }

      throw error;
    } finally {
      clearTimeout(temporizador);
    }
  }

  // =====================================================
  // NORMALIZACIÓN DE RESPUESTAS
  // =====================================================

  function normalizarDivisiones(datos) {
    const lista = Array.isArray(datos) ? datos : datos?.divisiones;

    if (!Array.isArray(lista)) return [];

    return lista.map((division) => ({
      id: obtenerId(division),
      nombre: obtenerNombre(division),
      descripcion: obtenerDescripcion(division),
      estado: normalizarEstado(division.estado ?? division.activa),
      consultas: Number(division.consultas ?? division.totalConsultas ?? 0),
      documentos: Number(division.documentos ?? division.totalDocumentos ?? 0),
    }));
  }

  function normalizarDocumentos(datos) {
    const lista = Array.isArray(datos) ? datos : datos?.documentos;

    if (!Array.isArray(lista)) return [];

    return lista.map((documento) => ({
      id: documento.id ?? documento._id ?? "",
      nombre: normalizarTexto(
        documento.nombre ?? documento.nombreArchivo ?? documento.filename,
      ),
      division: normalizarTexto(
        documento.divisionNombre ?? documento.division ?? "",
      ),
      divisionId: normalizarTexto(
        documento.divisionId ?? documento.division_id,
      ),
      estadoClasificacion: normalizarTexto(
        documento.estadoClasificacion ??
          documento.estado_clasificacion ??
          "clasificado",
      ).toLowerCase(),
      motivoClasificacion: normalizarTexto(
        documento.motivoClasificacion ?? documento.motivo_clasificacion ?? "",
      ),
      formato: normalizarTexto(documento.formato ?? documento.extension ?? ""),
      fecha:
        documento.fechaRegistro ??
        documento.fecha_registro ??
        documento.fecha ??
        documento.createdAt ??
        "",
      url: normalizarTexto(documento.url ?? documento.enlace ?? ""),
    }));
  }

  // =====================================================
  // CARGA DE INFORMACIÓN
  // =====================================================

  async function cargarDivisiones() {
    try {
      const resultado = await solicitar(CONFIG.API_DIVISIONES, {
        method: "GET",
      });

      divisiones = normalizarDivisiones(resultado);
      actualizarFiltroDocumentos();

      actualizarTarjetas();
      actualizarResumen();
      aplicarFiltros();

      return true;
    } catch (error) {
      console.error("[AsistIA] Error al cargar divisiones:", error);
      mostrarAviso(
        `No fue posible cargar las divisiones. ${error.message}`,
        "error",
      );
      return false;
    }
  }

  async function cargarDocumentos({ silencioso = false } = {}) {
    try {
      const resultado = await solicitar(CONFIG.API_DOCUMENTOS, {
        method: "GET",
      });

      documentos = normalizarDocumentos(resultado);

      actualizarResumen();
      renderizarDocumentos();

      return true;
    } catch (error) {
      console.error("[AsistIA] Error al cargar documentos:", error);

      establecerTexto(
        elementos.totalDocumentosTabla,
        "No se pudieron cargar los documentos",
      );

      if (elementos.cuerpoDocumentos) {
        mostrarEstadoTabla(
          "El servicio de documentos aún no está disponible.",
          elementos.cuerpoDocumentos,
        );
      }

      if (!silencioso) {
        mostrarAviso(
          "No se pudieron cargar los documentos. Es necesario habilitar el servicio de documentos en el servidor.",
          "aviso",
          6000,
        );
      }

      return false;
    }
  }

  async function actualizarTodo() {
    if (cargando) return;

    cargando = true;

    if (elementos.btnActualizar) {
      elementos.btnActualizar.disabled = true;
      elementos.btnActualizar.textContent = "Actualizando...";
    }

    await Promise.all([
      cargarDivisiones(),
      cargarDocumentos({ silencioso: true }),
    ]);

    cargando = false;

    if (elementos.btnActualizar) {
      elementos.btnActualizar.disabled = false;
      elementos.btnActualizar.textContent = "Actualizar";
    }
  }

  // =====================================================
  // INDICADORES GENERALES
  // =====================================================

  function actualizarResumen() {
    const total = divisiones.length;

    const activas = divisiones.filter(
      (division) => division.estado === "activa",
    ).length;

    const inactivas = total - activas;

    establecerTexto(elementos.total, formatearNumero(total));
    establecerTexto(elementos.activas, formatearNumero(activas));
    establecerTexto(elementos.inactivas, formatearNumero(inactivas));
    establecerTexto(elementos.documentos, formatearNumero(documentos.length));
  }

  // =====================================================
  // GENERACIÓN DINÁMICA DE TARJETAS
  // =====================================================

  function actualizarTarjetas() {
    if (!elementos.listaDivisiones) return;

    elementos.listaDivisiones.replaceChildren();

    divisiones.forEach((division) => {
      const tarjeta = document.createElement("article");
      tarjeta.className = "tarjeta-division";
      tarjeta.dataset.division = division.id;
      tarjeta.dataset.estado = division.estado;

      // Encabezado
      const superior = document.createElement("div");
      superior.className = "division-superior";

      const icono = document.createElement("div");
      icono.className = "division-icono";
      icono.textContent = division.nombre
        .split(/\s+/)
        .slice(0, 2)
        .map((palabra) => palabra.charAt(0).toUpperCase())
        .join("");

      const estado = document.createElement("span");
      estado.className = `estado-division ${division.estado}`;
      estado.textContent = division.estado === "activa" ? "Activa" : "Inactiva";

      superior.append(icono, estado);

      // Información
      const nombre = document.createElement("h3");
      nombre.textContent = division.nombre;

      const descripcion = document.createElement("p");
      descripcion.textContent =
        division.descripcion || "Sin descripción registrada.";

      // Estadísticas
      const estadisticas = document.createElement("div");
      estadisticas.className = "division-estadisticas";

      const bloqueConsultas = document.createElement("div");
      const cantidadConsultas = document.createElement("strong");
      cantidadConsultas.textContent = formatearNumero(division.consultas);

      const etiquetaConsultas = document.createElement("span");
      etiquetaConsultas.textContent = "Consultas";

      bloqueConsultas.append(cantidadConsultas, etiquetaConsultas);

      const bloqueDocumentos = document.createElement("div");
      const cantidadDocumentos = document.createElement("strong");
      cantidadDocumentos.textContent = formatearNumero(division.documentos);

      const etiquetaDocumentos = document.createElement("span");
      etiquetaDocumentos.textContent = "Documentos";

      bloqueDocumentos.append(cantidadDocumentos, etiquetaDocumentos);

      estadisticas.append(bloqueConsultas, bloqueDocumentos);

      // Acciones
      const acciones = document.createElement("div");
      acciones.className = "division-acciones";

      const botonVer = document.createElement("button");
      botonVer.type = "button";
      botonVer.className = "btn-ver-division";
      botonVer.dataset.id = division.id;
      botonVer.textContent = "Ver detalles";
      const botonEditar = document.createElement("button");
      botonEditar.type = "button";
      botonEditar.className = "btn-editar-division";
      botonEditar.dataset.id = division.id;
      botonEditar.textContent = "Editar";

      // Botón eliminar
      const botonEliminar = document.createElement("button");
      botonEliminar.type = "button";
      botonEliminar.className = "btn-eliminar-division";
      botonEliminar.dataset.id = division.id;
      botonEliminar.textContent = "Eliminar";
      botonEliminar.setAttribute(
        "aria-label",
        `Eliminar división ${division.nombre}`,
      );

      acciones.append(botonVer, botonEditar, botonEliminar);

      tarjeta.append(superior, nombre, descripcion, estadisticas, acciones);

      elementos.listaDivisiones.appendChild(tarjeta);
    });

    aplicarFiltros();
  }

  // =====================================================
  // BUSCADOR Y FILTROS
  // =====================================================

  function aplicarFiltros() {
    if (!elementos.listaDivisiones) return;

    const busqueda = normalizarTexto(elementos.buscador?.value).toLowerCase();

    const filtro = normalizarTexto(elementos.filtroEstado?.value).toLowerCase();

    const tarjetas = [
      ...elementos.listaDivisiones.querySelectorAll(".tarjeta-division"),
    ];

    let visibles = 0;

    tarjetas.forEach((tarjeta) => {
      const nombre = normalizarTexto(
        tarjeta.querySelector("h3")?.textContent,
      ).toLowerCase();

      const descripcion = normalizarTexto(
        tarjeta.querySelector("p")?.textContent,
      ).toLowerCase();

      const estado = tarjeta.dataset.estado;

      const coincideBusqueda =
        nombre.includes(busqueda) || descripcion.includes(busqueda);

      const coincideEstado = !filtro || filtro === "todas" || filtro === estado;

      const mostrar = coincideBusqueda && coincideEstado;

      tarjeta.hidden = !mostrar;

      if (mostrar) visibles++;
    });

    if (elementos.estadoVacio) {
      elementos.estadoVacio.hidden = visibles > 0;
    }
  }

  function actualizarFiltroDocumentos() {
    const selector = elementos.filtroDocumentos;

    if (!selector) return;

    const valorAnterior = selector.value;

    selector.replaceChildren();

    const opcionTodas = document.createElement("option");
    opcionTodas.value = "";
    opcionTodas.textContent = "Todas las divisiones";

    selector.appendChild(opcionTodas);

    divisiones.forEach((division) => {
      const opcion = document.createElement("option");

      opcion.value = division.id;
      opcion.textContent = division.nombre;

      selector.appendChild(opcion);
    });

    const existe = [...selector.options].some(
      (opcion) => opcion.value === valorAnterior,
    );

    selector.value = existe ? valorAnterior : "";
  }

  // =====================================================
  // CONSTRUCCIÓN DE CAMPOS
  // =====================================================

  function crearCampo({
    etiqueta,
    nombre,
    valor = "",
    tipo = "text",
    placeholder = "",
    requerido = true,
    ayuda = "",
  }) {
    const contenedor = document.createElement("label");
    contenedor.className = "asistia-modal-campo";

    const titulo = document.createElement("span");
    titulo.textContent = etiqueta;

    let campo;

    if (tipo === "textarea") {
      campo = document.createElement("textarea");
    } else {
      campo = document.createElement("input");
      campo.type = tipo;
    }

    campo.name = nombre;
    campo.value = valor;
    campo.placeholder = placeholder;
    campo.required = requerido;

    contenedor.append(titulo, campo);

    if (ayuda) {
      const textoAyuda = document.createElement("small");
      textoAyuda.className = "asistia-modal-ayuda";
      textoAyuda.textContent = ayuda;
      contenedor.appendChild(textoAyuda);
    }

    return { contenedor, campo };
  }

  function crearSelectorEstado(valor = "activa") {
    const contenedor = document.createElement("label");
    contenedor.className = "asistia-modal-campo";

    const titulo = document.createElement("span");
    titulo.textContent = "Estado de la división";

    const selector = document.createElement("select");
    selector.name = "estado";

    [
      { value: "activa", label: "Activa" },
      { value: "inactiva", label: "Inactiva" },
    ].forEach((opcion) => {
      const elemento = document.createElement("option");
      elemento.value = opcion.value;
      elemento.textContent = opcion.label;
      selector.appendChild(elemento);
    });

    selector.value = valor;

    contenedor.append(titulo, selector);

    return { contenedor, campo: selector };
  }

  function crearBoton(texto, clase) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = `asistia-modal-boton ${clase}`;
    boton.textContent = texto;
    return boton;
  }

  // =====================================================
  // CREAR DIVISIÓN
  // =====================================================

  async function crearDivision() {
    const formulario = document.createElement("form");
    formulario.noValidate = true;

    const campoNombre = crearCampo({
      etiqueta: "Nombre de la división",
      nombre: "nombre",
      placeholder: "Ej. Talento Humano",
      ayuda: "Escribe el nombre institucional de la división.",
    });

    const campoDescripcion = crearCampo({
      etiqueta: "Descripción",
      nombre: "descripcion",
      tipo: "textarea",
      placeholder: "Describe las funciones y servicios de esta división.",
      ayuda: "Utiliza una descripción clara para orientar a los estudiantes.",
    });

    const acciones = document.createElement("div");
    acciones.className = "asistia-modal-acciones";

    const cancelar = crearBoton("Cancelar", "asistia-modal-cancelar");

    const guardar = crearBoton("Registrar división", "asistia-modal-guardar");

    acciones.append(cancelar, guardar);

    formulario.append(
      campoNombre.contenedor,
      campoDescripcion.contenedor,
      acciones,
    );

    const modal = crearModal({
      titulo: "Nueva división",
      descripcion: "Registra una nueva área institucional en AsistIA.",
      contenido: formulario,
    });

    if (!modal) return;

    cancelar.addEventListener("click", () => modal.cerrar());

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
    });

    guardar.addEventListener("click", async () => {
      const nombre = normalizarTexto(campoNombre.campo.value);
      const descripcion = normalizarTexto(campoDescripcion.campo.value);

      if (nombre.length < 2) {
        mostrarAviso("El nombre debe contener al menos 2 caracteres.", "aviso");
        campoNombre.campo.focus();
        return;
      }

      if (descripcion.length < 5) {
        mostrarAviso("Escribe una descripción más completa.", "aviso");
        campoDescripcion.campo.focus();
        return;
      }

      if (
        divisiones.some(
          (division) => division.nombre.toLowerCase() === nombre.toLowerCase(),
        )
      ) {
        mostrarAviso("Ya existe una división con ese nombre.", "aviso");
        campoNombre.campo.focus();
        return;
      }

      guardar.disabled = true;
      guardar.textContent = "Registrando...";

      try {
        await solicitar(CONFIG.API_DIVISIONES, {
          method: "POST",
          body: JSON.stringify({
            nombre,
            descripcion,
            estado: "activa",
          }),
        });

        modal.cerrar();
        mostrarAviso("La división se registró correctamente.", "exito");
        await cargarDivisiones();
      } catch (error) {
        guardar.disabled = false;
        guardar.textContent = "Registrar división";
        mostrarAviso(
          `No fue posible registrar la división: ${error.message}`,
          "error",
        );
      }
    });

    campoNombre.campo.focus();
  }

  // =====================================================
  // EDITAR DIVISIÓN
  // =====================================================

  async function editarDivision(id) {
    const division = divisiones.find((item) => item.id === String(id));

    if (!division) {
      mostrarAviso("No se encontró la división seleccionada.", "error");
      return;
    }

    const formulario = document.createElement("form");
    formulario.noValidate = true;

    const campoNombre = crearCampo({
      etiqueta: "Nombre de la división",
      nombre: "nombre",
      valor: division.nombre,
      placeholder: "Nombre de la división",
    });

    const campoDescripcion = crearCampo({
      etiqueta: "Descripción institucional",
      nombre: "descripcion",
      tipo: "textarea",
      valor: division.descripcion,
      placeholder: "Describe las funciones de esta división.",
    });

    const campoEstado = crearSelectorEstado(division.estado);

    const acciones = document.createElement("div");
    acciones.className = "asistia-modal-acciones";

    const cancelar = crearBoton("Cancelar", "asistia-modal-cancelar");

    const guardar = crearBoton("Guardar cambios", "asistia-modal-guardar");

    acciones.append(cancelar, guardar);

    formulario.append(
      campoNombre.contenedor,
      campoDescripcion.contenedor,
      campoEstado.contenedor,
      acciones,
    );

    const modal = crearModal({
      titulo: "Editar división",
      descripcion: `Actualiza la información de ${division.nombre}.`,
      contenido: formulario,
    });

    if (!modal) return;

    cancelar.addEventListener("click", () => modal.cerrar());

    guardar.addEventListener("click", async () => {
      const nombre = normalizarTexto(campoNombre.campo.value);
      const descripcion = normalizarTexto(campoDescripcion.campo.value);
      const estado = campoEstado.campo.value;

      if (nombre.length < 2) {
        mostrarAviso("El nombre debe contener al menos 2 caracteres.", "aviso");
        campoNombre.campo.focus();
        return;
      }

      if (descripcion.length < 5) {
        mostrarAviso("Escribe una descripción más completa.", "aviso");
        campoDescripcion.campo.focus();
        return;
      }

      const duplicada = divisiones.some(
        (item) =>
          item.id !== division.id &&
          item.nombre.toLowerCase() === nombre.toLowerCase(),
      );

      if (duplicada) {
        mostrarAviso("Ya existe otra división con ese nombre.", "aviso");
        campoNombre.campo.focus();
        return;
      }

      guardar.disabled = true;
      guardar.textContent = "Guardando...";

      try {
        await solicitar(
          `${CONFIG.API_DIVISIONES}/${encodeURIComponent(division.id)}`,
          {
            method: "PUT",
            body: JSON.stringify({
              nombre,
              descripcion,
              estado,
            }),
          },
        );

        modal.cerrar();
        mostrarAviso("Los cambios se guardaron correctamente.", "exito");
        await cargarDivisiones();
      } catch (error) {
        guardar.disabled = false;
        guardar.textContent = "Guardar cambios";
        mostrarAviso(
          `No fue posible actualizar la división: ${error.message}`,
          "error",
        );
      }
    });

    campoNombre.campo.focus();
  }
  // =====================================================
  // ELIMINAR DIVISIÓN
  // =====================================================

  async function eliminarDivision(id) {
    const division = divisiones.find((item) => item.id === String(id));

    if (!division) {
      mostrarAviso("No se encontró la división seleccionada.", "error");
      return;
    }

    const confirmado = await confirmarAccion({
      titulo: "Eliminar división",
      descripcion:
        `¿Estás seguro de que deseas eliminar "${division.nombre}"? ` +
        "Esta acción es permanente. Solo será posible eliminarla si no tiene consultas ni documentos asociados.",
      textoConfirmar: "Sí, eliminar",
      peligro: true,
    });

    if (!confirmado) return;

    try {
      await solicitar(
        `${CONFIG.API_DIVISIONES}/${encodeURIComponent(division.id)}`,
        {
          method: "DELETE",
        },
      );

      mostrarAviso(
        `La división "${division.nombre}" se eliminó correctamente.`,
        "exito",
      );

      await cargarDivisiones();
      await cargarDocumentos({ silencioso: true });
    } catch (error) {
      console.error("[AsistIA] Error al eliminar división:", error);

      mostrarAviso(
        error.message || "No fue posible eliminar la división.",
        "error",
        6000,
      );
    }
  }

  // =====================================================
  // DETALLES DE UNA DIVISIÓN
  // =====================================================

  function verDetalles(id) {
    const division = divisiones.find((item) => item.id === String(id));

    if (!division) {
      mostrarAviso("No se encontraron los detalles de esta división.", "error");
      return;
    }

    const contenido = document.createElement("div");

    const detalles = [
      ["Nombre de la división", division.nombre],
      ["Descripción", division.descripcion || "Sin descripción registrada."],
      ["Consultas registradas", formatearNumero(division.consultas)],
      ["Documentos asociados", formatearNumero(division.documentos)],
    ];

    const contenedorDetalles = document.createElement("div");
    contenedorDetalles.className = "asistia-modal-detalles";

    detalles.forEach(([etiqueta, valor]) => {
      const bloque = document.createElement("div");
      bloque.className = "asistia-modal-detalle";

      const titulo = document.createElement("small");
      titulo.textContent = etiqueta;

      const texto = document.createElement("p");
      texto.textContent = valor;

      bloque.append(titulo, texto);
      contenedorDetalles.appendChild(bloque);
    });

    const estado = document.createElement("div");
    estado.className = `asistia-modal-estado ${
      division.estado === "inactiva" ? "inactiva" : ""
    }`;

    estado.textContent =
      division.estado === "activa"
        ? "● División activa"
        : "● División inactiva";

    contenido.append(estado, contenedorDetalles);

    const acciones = document.createElement("div");
    acciones.className = "asistia-modal-acciones";

    const cerrar = crearBoton("Cerrar", "asistia-modal-cancelar");

    const editar = crearBoton("Editar división", "asistia-modal-guardar");

    acciones.append(cerrar, editar);
    contenido.appendChild(acciones);

    const modal = crearModal({
      titulo: "Información de la división",
      descripcion: "Consulta los datos registrados en el sistema.",
      contenido,
    });

    if (!modal) return;

    cerrar.addEventListener("click", () => modal.cerrar());

    editar.addEventListener("click", () => {
      modal.cerrar();
      window.setTimeout(() => editarDivision(division.id), 150);
    });
  }
  // =====================================================
  // DOCUMENTOS — FILTRO Y TABLA
  // =====================================================

  function renderizarDocumentos() {
    if (!elementos.cuerpoDocumentos) return;

    const filtro = normalizarTexto(
      elementos.filtroDocumentos?.value,
    ).toLowerCase();

    const filtrados = documentos.filter((documento) => {
      return (
        !filtro ||
        documento.division.toLowerCase() === filtro ||
        documento.divisionId.toLowerCase() === filtro
      );
    });

    elementos.cuerpoDocumentos.replaceChildren();

    if (filtrados.length === 0) {
      mostrarEstadoTabla(
        "No hay documentos para mostrar.",
        elementos.cuerpoDocumentos,
      );
    } else {
      filtrados.forEach((documento) => {
        const fila = document.createElement("tr");

        const celdaNombre = document.createElement("td");
        celdaNombre.textContent = documento.nombre || "Documento sin nombre";

        const celdaDivision = document.createElement("td");

        if (documento.estadoClasificacion === "transversal") {
          celdaDivision.textContent = "Institucional (transversal)";
        } else if (documento.estadoClasificacion === "pendiente") {
          celdaDivision.textContent = "Pendiente de clasificación";
        } else {
          celdaDivision.textContent = documento.division || "Sin división";
        }

        const celdaFormato = document.createElement("td");
        celdaFormato.textContent = documento.formato || "No especificado";

        const celdaFecha = document.createElement("td");
        celdaFecha.textContent = formatearFecha(documento.fecha);

        const celdaAcciones = document.createElement("td");

        if (documento.url) {
          const enlace = document.createElement("a");
          enlace.href = documento.url;
          enlace.target = "_blank";
          enlace.rel = "noopener noreferrer";
          enlace.textContent = "Ver documento";
          celdaAcciones.appendChild(enlace);
        } else {
          celdaAcciones.textContent = "Sin enlace disponible";
        }

        fila.append(
          celdaNombre,
          celdaDivision,
          celdaFormato,
          celdaFecha,
          celdaAcciones,
        );

        elementos.cuerpoDocumentos.appendChild(fila);
      });
    }

    establecerTexto(
      elementos.totalDocumentosTabla,
      `${filtrados.length} ${
        filtrados.length === 1 ? "documento" : "documentos"
      }`,
    );
  }

  function mostrarEstadoTabla(mensaje, tabla) {
    const fila = document.createElement("tr");
    const celda = document.createElement("td");

    celda.colSpan = 5;
    celda.textContent = mensaje;

    fila.appendChild(celda);
    tabla.replaceChildren(fila);
  }

  function formatearFecha(fecha) {
    if (!fecha) return "Sin fecha";

    const valor = new Date(fecha);

    if (Number.isNaN(valor.getTime())) {
      return String(fecha);
    }

    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
    }).format(valor);
  }

  // =====================================================
  // SUBIR DOCUMENTOS
  // =====================================================

  function seleccionarDocumento() {
    const formulario = document.createElement("form");
    formulario.noValidate = true;

    const campoArchivo = crearCampo({
      etiqueta: "Archivo institucional",
      nombre: "documento",
      tipo: "file",
      requerido: true,
      ayuda:
        "Formatos permitidos: PDF, DOCX y TXT. Groq identificará automáticamente la división correspondiente.",
    });

    campoArchivo.campo.accept = ".pdf,.docx,.txt";

    const acciones = document.createElement("div");
    acciones.className = "asistia-modal-acciones";

    const cancelar = crearBoton("Cancelar", "asistia-modal-cancelar");

    const subir = crearBoton("Cargar documento", "asistia-modal-guardar");

    acciones.append(cancelar, subir);

    formulario.append(campoArchivo.contenedor, acciones);

    const modal = crearModal({
      titulo: "Subir documento",
      descripcion:
        "Selecciona el documento institucional. AsistIA analizará su contenido y determinará automáticamente si pertenece a una división, es transversal o requiere revisión.",
      contenido: formulario,
    });

    if (!modal) return;

    cancelar.addEventListener("click", () => modal.cerrar());

    subir.addEventListener("click", async () => {
      const archivo = campoArchivo.campo.files?.[0];

      if (!archivo) {
        mostrarAviso("Selecciona un archivo antes de continuar.", "aviso");
        return;
      }

      const extension = archivo.name.split(".").pop().toLowerCase();
      const permitidas = ["pdf", "docx", "txt"];

      if (!permitidas.includes(extension)) {
        mostrarAviso("El formato del archivo no está permitido.", "error");
        return;
      }

      const datos = new FormData();
      datos.append("documento", archivo);

      subir.disabled = true;
      subir.textContent = "Analizando documento...";

      try {
        const resultado = await solicitar(CONFIG.API_DOCUMENTOS, {
          method: "POST",
          body: datos,
        });

        const documento = resultado?.documento;
        const estado = normalizarTexto(
          documento?.estadoClasificacion,
        ).toLowerCase();

        modal.cerrar();

        if (estado === "clasificado") {
          mostrarAviso(
            `Documento clasificado correctamente en: ${
              documento.divisionNombre || "División asignada"
            }.`,
            "exito",
            6000,
          );
        } else if (estado === "transversal") {
          mostrarAviso(
            "Documento registrado como institucional transversal. Estará disponible para todas las divisiones.",
            "exito",
            6000,
          );
        } else if (estado === "pendiente") {
          mostrarAviso(
            `Documento registrado, pero requiere revisión. ${
              documento.motivoClasificacion || ""
            }`,
            "aviso",
            7000,
          );
        } else {
          mostrarAviso(
            "El documento se cargó correctamente. Actualiza el listado para consultar su clasificación.",
            "exito",
          );
        }

        await cargarDocumentos({ silencioso: true });
        await cargarDivisiones();
      } catch (error) {
        subir.disabled = false;
        subir.textContent = "Cargar documento";

        mostrarAviso(
          `No fue posible cargar el documento: ${error.message}`,
          "error",
          6000,
        );
      }
    });
  }

  // =====================================================
  // CERRAR SESIÓN
  // =====================================================

  async function cerrarSesion() {
    const confirmado = await confirmarAccion({
      titulo: "Cerrar sesión",
      descripcion:
        "¿Estás seguro de que deseas salir del panel administrativo?",
      textoConfirmar: "Sí, cerrar sesión",
      peligro: true,
    });

    if (!confirmado) return;

    if (elementos.btnCerrarSesion) {
      elementos.btnCerrarSesion.disabled = true;
    }

    try {
      await solicitar(CONFIG.API_LOGOUT, {
        method: "POST",
      });
    } catch (error) {
      console.error("[AsistIA] Error al cerrar sesión:", error);
    } finally {
      window.location.replace("admin-login.html");
    }
  }
  // =====================================================
  // EVENTOS
  // =====================================================

  function configurarEventos() {
    elementos.buscador?.addEventListener("input", aplicarFiltros);

    elementos.filtroEstado?.addEventListener("change", aplicarFiltros);

    elementos.filtroDocumentos?.addEventListener(
      "change",
      renderizarDocumentos,
    );

    elementos.btnNueva?.addEventListener("click", crearDivision);

    elementos.btnActualizar?.addEventListener("click", actualizarTodo);

    elementos.btnSubirDocumento?.addEventListener(
      "click",
      seleccionarDocumento,
    );

    elementos.btnCerrarSesion?.addEventListener("click", cerrarSesion);

    elementos.listaDivisiones?.addEventListener("click", (evento) => {
      const botonVer = evento.target.closest(".btn-ver-division");

      const botonEditar = evento.target.closest(".btn-editar-division");

      const botonEliminar = evento.target.closest(".btn-eliminar-division");

      if (botonVer) {
        verDetalles(botonVer.dataset.id);
        return;
      }

      if (botonEditar) {
        editarDivision(botonEditar.dataset.id);
        return;
      }

      if (botonEliminar) {
        eliminarDivision(botonEliminar.dataset.id);
      }
    });
  }

  // =====================================================
  // INICIALIZACIÓN
  // =====================================================

  async function iniciar() {
    inyectarEstilos();
    establecerFecha();
    configurarEventos();

    await actualizarTodo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
