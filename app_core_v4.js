// ============================================================
// APP CORE — Motor inteligente + warm-up + indicador visual
// Versión final corregida 2026-02-27
// ============================================================

/* ============================================================
   TOGGLE UNIVERSAL — PARA PANELES (results, dashboard, filtros, admin, ayuda)
   ============================================================ */
function toggle(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  const current = window.getComputedStyle(el).display;
  el.style.display = current === "none" ? "block" : "none";
}

const AppCore = {
  // ==========================================================
  // CONFIG
  // ==========================================================
  config: {
    backendUrl:
      localStorage.getItem("backendURL") ||
      "https://stock-backend-1-0upi.onrender.com",
    modoDefecto: localStorage.getItem("modoDefecto") || "simple",
  },

  // ==========================================================
  // ELEMENTOS
  // ==========================================================
  els: {
    searchInput: document.getElementById("search-input"),
    searchStatus: document.getElementById("search-status"),

    chkSoloStock: document.getElementById("chk-solo-stock"),
    filtroMarca: document.getElementById("filtro-marca"),
    filtroRubro: document.getElementById("filtro-rubro"),
    filtroTalleDesde: document.getElementById("filtro-talle-desde"),
    filtroTalleHasta: document.getElementById("filtro-talle-hasta"),

    filtroUnidadesDesde: document.getElementById("filtro-unidades-desde"),
    filtroUnidadesHasta: document.getElementById("filtro-unidades-hasta"),

    filtrosPanel: document.getElementById("filtros-panel"),
    btnAplicarFiltros: document.getElementById("btn-aplicar-filtros"),

    resultsContainer: document.getElementById("results-container"),
    resultsStatus: document.getElementById("results-status"),

    vistaTabla: document.getElementById("vista-tabla"),
    vistaTarjeta: document.getElementById("vista-tarjeta"),
    vistaArticulo: document.getElementById("vista-articulo"),

    metricArticulos: document.getElementById("metric-articulos-value"),
    metricPares: document.getElementById("metric-pares-value"),
    metricAlertasNegativos: document.getElementById("metric-alertas-negativos-value"),
    metricAlertasCero: document.getElementById("metric-alertas-cero-value"),
    metricValorizado: document.getElementById("metric-valorizado-value"),
    metricUltimaUnidad: document.getElementById("metric-ultima-unidad-value"),

    connectionDot: document.getElementById("connection-dot"),

    fuenteArchivo: document.getElementById("fuente-archivo"),
    fuenteFecha: document.getElementById("fuente-fecha"),
    fuenteMarcas: document.getElementById("fuente-marcas"),
    fuenteRubros: document.getElementById("fuente-rubros"),
    fuenteArticulos: document.getElementById("fuente-articulos"),
    fuenteStockTotal: document.getElementById("fuente-stock-total"),
    fuenteStockNegativo: document.getElementById("fuente-stock-negativo"),
  },

  // ==========================================================
  // STATE
  // ==========================================================
  state: {
    items: [],
    catalogItems: [],
    lastQuery: "",
    currentAbort: null,
    filtros: {
      marca: null,
      rubro: null,
      talleDesde: null,
      talleHasta: null,
      unidadesDesde: null,
      unidadesHasta: null,
    },
    vistaActual: "tarjeta",
    resumenCatalogo: null,
    retryTimeout: null,
    warmingUp: true,
  },

  // ==========================================================
  // UTILIDADES BÁSICAS
  // ==========================================================
  normalizarCampo(v) {
    if (!v && v !== 0) return "—";
    const t = String(v).trim().toUpperCase();
    if (["NAN", "NULL", "UNDEFINED"].includes(t)) return "—";
    return v;
  },

  normalizarTexto(v) {
    if (!v) return "";
    return v
      .toString()
      .normalize("NFKD")
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  },

  limpiarInput(raw) {
    if (!raw) return "";
    return raw
      .toString()
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  },

  formatNumber(n) {
    return Number(n || 0).toLocaleString("es-AR");
  },

  showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
  },

  setConnectionStatus(ok) {
    this.els.connectionDot?.classList.toggle("online", ok);
  },

  setSearchStatus(text, color = "blue") {
    if (!this.els.searchStatus) return;
    this.els.searchStatus.textContent = text;
    this.els.searchStatus.className = "search-status " + color;
  },

  setOrbIdle() {
    if (!window.ORB) return;
    ORB.setError?.(false);
    ORB.setLoading?.(false);
  },

  calcularResumenLocal(items) {
    const arr = items || [];
    const marcas = new Set();
    const rubros = new Set();
    let stockTotal = 0;
    let stockNegativo = 0;

    arr.forEach((it) => {
      if (it.marca) marcas.add(it.marca);
      if (it.rubro) rubros.add(it.rubro);

      let sum = 0;
      (it.talles || []).forEach((t) => {
        const s = Number(t.stock || 0);
        sum += s;
      });

      stockTotal += sum;
      if (sum < 0) stockNegativo += 1;
    });

    return {
      archivo: "—",
      fecha: "—",
      marcas: marcas.size,
      rubros: rubros.size,
      articulos: arr.length,
      stock_total: stockTotal,
      stock_negativo: stockNegativo,
    };
  },

  // ==========================================================
  // AUTOCOMPLETE
  // ==========================================================
  getAutocompleteSuggestions(term) {
    const q = this.normalizarTexto(term);
    if (!q || !this.state.catalogItems.length) return [];

    const exactArticulo = [];
    const exactMarca = [];
    const exactRubro = [];
    const exactDescripcion = [];

    const prefijoArticulo = [];
    const prefijoMarca = [];
    const prefijoRubro = [];
    const prefijoDescripcion = [];

    const parcialArticulo = [];
    const parcialMarca = [];
    const parcialRubro = [];
    const parcialDescripcion = [];

    const pushUnique = (arr, value) => {
      if (!value) return;
      if (!arr.includes(value)) arr.push(value);
    };

    this.state.catalogItems.forEach((item) => {
      const descRaw = item.descripcion || "";
      const marcaRaw = item.marca || "";
      const rubroRaw = item.rubro || "";
      const codigoRaw = item.codigo || "";

      const descN = this.normalizarTexto(descRaw);
      const marcaN = this.normalizarTexto(marcaRaw);
      const rubroN = this.normalizarTexto(rubroRaw);
      const codigoN = this.normalizarTexto(codigoRaw);

      const startsWith = (txt) => txt && txt.startsWith(q);
      const contains = (txt) => txt && txt.includes(q);

      if (codigoN === q || descN === q)
        pushUnique(exactArticulo, descRaw || codigoRaw);
      else if (startsWith(codigoN) || startsWith(descN))
        pushUnique(prefijoArticulo, descRaw || codigoRaw);
      else if (contains(codigoN) || contains(descN))
        pushUnique(parcialArticulo, descRaw || codigoRaw);

      if (marcaN) {
        if (marcaN === q) pushUnique(exactMarca, marcaRaw);
        else if (startsWith(marcaN)) pushUnique(prefijoMarca, marcaRaw);
        else if (contains(marcaN)) pushUnique(parcialMarca, marcaRaw);
      }

      if (rubroN) {
        if (rubroN === q) pushUnique(exactRubro, rubroRaw);
        else if (startsWith(rubroN)) pushUnique(prefijoRubro, rubroRaw);
        else if (contains(rubroN)) pushUnique(parcialRubro, rubroRaw);
      }

      if (descN) {
        if (descN === q) pushUnique(exactDescripcion, descRaw);
        else if (startsWith(descN)) pushUnique(prefijoDescripcion, descRaw);
        else if (contains(descN)) pushUnique(parcialDescripcion, descRaw);
      }
    });

    const ordered = [
      ...exactArticulo,
      ...exactMarca,
      ...exactRubro,
      ...exactDescripcion,
      ...prefijoArticulo,
      ...prefijoMarca,
      ...prefijoRubro,
      ...prefijoDescripcion,
      ...parcialArticulo,
      ...parcialMarca,
      ...parcialRubro,
      ...parcialDescripcion,
    ];

    const final = [];
    const seen = new Set();
    for (const v of ordered) {
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      final.push(v);
      if (final.length >= 12) break;
    }

    return final;
  },

  // ==========================================================
  // WARM-UP + CARGA CATÁLOGO
  // ==========================================================
  async pingBackend() {
    this.setSearchStatus("Activando servidor…", "orange");
    this.setConnectionStatus(false);

    try {
      const res = await fetch(this.config.backendUrl + "/ping");
      if (!res.ok) throw new Error();

      this.setSearchStatus("Conectado", "green");
      this.setConnectionStatus(true);
      this.state.warmingUp = false;
      return true;
    } catch {
      this.setSearchStatus("Activando servidor…", "orange");
      return false;
    }
  },

  async warmUpLoop() {
    if (this.state.currentAbort) return;

    const ok = await this.pingBackend();
    if (!ok) {
      clearTimeout(this.state.retryTimeout);
      this.state.retryTimeout = setTimeout(() => this.warmUpLoop(), 2000);
      return;
    }
    this.cargarCatalogo();
  },

  async cargarCatalogo() {
    this.setSearchStatus("Cargando catálogo…", "blue");

    try {
      const res = await fetch(this.config.backendUrl + "/catalog");
      if (!res.ok) throw new Error();

      const data = await res.json();

      this.state.catalogItems = data.items || [];

      if (data.resumen) this.state.resumenCatalogo = data.resumen;
      else
        this.state.resumenCatalogo = this.calcularResumenLocal(
          this.state.catalogItems
        );

      const r = this.state.resumenCatalogo || {};

      if (this.els.fuenteArchivo)
        this.els.fuenteArchivo.textContent = r.archivo || "—";
      if (this.els.fuenteFecha)
        this.els.fuenteFecha.textContent = r.fecha || "—";
      if (this.els.fuenteMarcas)
        this.els.fuenteMarcas.textContent = r.marcas ?? "—";
      if (this.els.fuenteRubros)
        this.els.fuenteRubros.textContent = r.rubros ?? "—";
      if (this.els.fuenteArticulos)
        this.els.fuenteArticulos.textContent = r.articulos ?? "—";
      if (this.els.fuenteStockTotal)
        this.els.fuenteStockTotal.textContent = r.stock_total ?? "—";
      if (this.els.fuenteStockNegativo)
        this.els.fuenteStockNegativo.textContent =
          r.stock_negativo ?? "—";

      this.poblarFiltros();

      this.setConnectionStatus(true);
      this.setSearchStatus("Conectado", "green");
    } catch {
      this.setConnectionStatus(false);
      this.setSearchStatus("Error de conexión", "red");

      clearTimeout(this.state.retryTimeout);
      this.state.retryTimeout = setTimeout(() => this.warmUpLoop(), 2000);
    }
  },

  poblarFiltros() {
    const marcas = new Set();
    const rubros = new Set();

    this.state.catalogItems.forEach((i) => {
      if (i.marca) marcas.add(i.marca);
      if (i.rubro) rubros.add(i.rubro);
    });

    if (this.els.filtroMarca)
      this.els.filtroMarca.innerHTML =
        `<option value="">Marca</option>` +
        [...marcas].sort().map((m) => `<option>${m}</option>`).join("");

    if (this.els.filtroRubro)
      this.els.filtroRubro.innerHTML =
        `<option value="">Rubro</option>` +
        [...rubros].sort().map((r) => `<option>${r}</option>`).join("");
  },
  },

  // ============================================================
  // PARSER INTELIGENTE
  // ============================================================
  interpretarQuery(raw) {
    const q = this.limpiarInput(raw);
    const qUpper = this.normalizarTexto(q);

    const mapMarcas = new Map();
    const mapRubros = new Map();

    this.state.catalogItems.forEach((i) => {
      if (i.marca) mapMarcas.set(this.normalizarTexto(i.marca), i.marca);
      if (i.rubro) mapRubros.set(this.normalizarTexto(i.rubro), i.rubro);
    });

    const marcasNorm = [...mapMarcas.keys()];
    const rubrosNorm = [...mapRubros.keys()];

    let marca = null;
    let rubro = null;

    const tokens = qUpper.split(/\W+/).filter(Boolean);

    for (const m of marcasNorm.sort((a, b) => b.length - a.length)) {
      if (tokens.includes(m)) marca = mapMarcas.get(m);
    }

    for (const r of rubrosNorm.sort((a, b) => b.length - a.length)) {
      if (tokens.includes(r)) rubro = mapRubros.get(r);
    }

    // RANGO DE TALLES (ej: 38-42, 38 a 42, T38/42)
    const matchRango = qUpper.match(/T?(\d+)\s*(?:A|-|\/)\s*T?(\d+)/);
    if (matchRango) {
      return {
        filtros_globales: true,
        marca,
        rubro,
        talleDesde: parseInt(matchRango[1]),
        talleHasta: parseInt(matchRango[2]),
        soloUltimo: false,
        soloNegativo: false,
        question: "",
      };
    }

    // TALLE ÚNICO (ej: 40, T40)
    const matchTalle = qUpper.match(/^T?(\d{1,3})$/);
    if (matchTalle) {
      const t = parseInt(matchTalle[1]);
      return {
        filtros_globales: true,
        marca,
        rubro,
        talleDesde: t,
        talleHasta: t,
        soloUltimo: false,
        soloNegativo: false,
        question: "",
      };
    }

    // PRECIO (ej: $50000, P50000)
    const matchPrecio = qUpper.match(/^(?:P|\$)?(\d{2,6})$/);
    if (matchPrecio) {
      return {
        filtros_globales: false,
        marca: null,
        rubro: null,
        talleDesde: null,
        talleHasta: null,
        soloUltimo: false,
        soloNegativo: false,
        question: matchPrecio[1],
      };
    }

    // CÓDIGO numérico largo (ej: 12345678)
    if (/^\d[\d\- ]{6,14}\d$/.test(qUpper)) {
      return {
        filtros_globales: false,
        marca: null,
        rubro: null,
        talleDesde: null,
        talleHasta: null,
        soloUltimo: false,
        soloNegativo: false,
        question: qUpper.replace(/[\s\-]/g, ""),
      };
    }

    // ÚLTIMO / NEGATIVO
    const esUltimo = /\bULTIM[OA]S?\b/.test(qUpper);
    const esNegativo = /\bNEGATIV[OA]S?\b/.test(qUpper);

    if (esUltimo || esNegativo) {
      return {
        filtros_globales: true,
        marca,
        rubro,
        talleDesde: null,
        talleHasta: null,
        soloUltimo: esUltimo,
        soloNegativo: esNegativo,
        question: "",
      };
    }

    // MARCA / RUBRO EXACTOS
    const qNorm = this.normalizarTexto(q);
    const esMarcaExacta = marcasNorm.includes(qNorm);
    const esRubroExacto = rubrosNorm.includes(qNorm);

    let usarFiltros = esMarcaExacta || esRubroExacto;

    if (!usarFiltros && tokens.length === 1 && marcasNorm.length) {
      const marcaCorregida = this.corregirMarcaPorVoz?.(qNorm, mapMarcas);
      if (marcaCorregida) {
        marca = marcaCorregida;
        usarFiltros = true;
      }
    }

    return {
      filtros_globales: usarFiltros,
      marca: usarFiltros ? marca : null,
      rubro: usarFiltros ? rubro : null,
      talleDesde: null,
      talleHasta: null,
      soloUltimo: false,
      soloNegativo: false,
      question: usarFiltros ? "" : q,
    };
  },

  // ============================================================
  // BÚSQUEDA PRINCIPAL (FIX AbortError)
  // ============================================================
  async buscar() {
    const raw = this.els.searchInput?.value || "";
    const q = this.limpiarInput(raw);

    if (!q) {
      this.limpiarPantalla();
      return;
    }

    this.state.lastQuery = q;

    const parsed = this.interpretarQuery(q);

    const body = {
      question: parsed.question || "",
      filtros_globales: !!parsed.filtros_globales,
      marca: parsed.marca || null,
      rubro: parsed.rubro || null,
      talleDesde: parsed.talleDesde || null,
      talleHasta: parsed.talleHasta || null,
      soloUltimo: parsed.soloUltimo || false,
      soloNegativo: parsed.soloNegativo || false,
      solo_stock: this.els.chkSoloStock?.checked || false,
    };

    if (this.state.currentAbort) this.state.currentAbort.abort();
    this.state.currentAbort = new AbortController();

    this.setSearchStatus("Buscando…", "blue");
    ORB.setError?.(false);
    ORB.setLoading?.(true);

    if (this.els.resultsStatus)
      this.els.resultsStatus.textContent = "Buscando…";

    try {
      const res = await fetch(this.config.backendUrl + "/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.state.currentAbort.signal,
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      this.state.items = data.items || [];

      this.renderResultados(this.state.items);
      window.actualizarDashboard?.(this.state.items);
      this.actualizarIndicadores(this.state.items);

      this.setConnectionStatus(true);
      this.setOrbIdle();
      this.setSearchStatus("Conectado", "green");

      if (this.els.resultsStatus)
        this.els.resultsStatus.textContent = `${this.state.items.length} resultados`;

      if (window.ORB?.isVoiceMode?.()) {
        this.speakResultados();
      }
    } catch (err) {
      if (err.name === "AbortError") return;

      this.setConnectionStatus(false);
      ORB.setError?.(true);

      this.setSearchStatus("Error de conexión", "red");
      if (this.els.resultsStatus)
        this.els.resultsStatus.textContent = "Error de conexión";

      clearTimeout(this.state.retryTimeout);
      this.state.retryTimeout = setTimeout(() => this.warmUpLoop(), 2000);
    } finally {
      ORB.setLoading?.(false);
    }
  },

  // ============================================================
  // BÚSQUEDA POR FILTROS (incluye unidades + FIX AbortError)
  // ============================================================
  actualizarFiltrosDesdeUI() {
    this.state.filtros.marca = this.els.filtroMarca?.value || null;
    this.state.filtros.rubro = this.els.filtroRubro?.value || null;
    this.state.filtros.talleDesde = this.els.filtroTalleDesde?.value || null;
    this.state.filtros.talleHasta = this.els.filtroTalleHasta?.value || null;

    this.state.filtros.unidadesDesde =
      this.els.filtroUnidadesDesde?.value || null;
    this.state.filtros.unidadesHasta =
      this.els.filtroUnidadesHasta?.value || null;
  },

  filtrarPorUnidadesLocal(items) {
    const desdeRaw = this.state.filtros.unidadesDesde;
    const hastaRaw = this.state.filtros.unidadesHasta;

    if (!desdeRaw && !hastaRaw) return items;

    const desde = desdeRaw ? parseInt(desdeRaw, 10) : null;
    const hasta = hastaRaw ? parseInt(hastaRaw, 10) : null;

    if (!desde && !hasta) return items;

    return (items || []).filter((it) => {
      const total = (it.talles || []).reduce(
        (acc, t) => acc + Number(t.stock || 0),
        0
      );

      if (desde !== null && total < desde) return false;
      if (hasta !== null && total > hasta) return false;
      return true;
    });
  },

  async buscarPorFiltros() {
    this.actualizarFiltrosDesdeUI();

    const body = {
      question: "",
      filtros_globales: true,
      marca: this.state.filtros.marca || null,
      rubro: this.state.filtros.rubro || null,
      talleDesde: this.state.filtros.talleDesde
        ? parseInt(this.state.filtros.talleDesde)
        : null,
      talleHasta: this.state.filtros.talleHasta
        ? parseInt(this.state.filtros.talleHasta)
        : null,
      soloUltimo: false,
      soloNegativo: false,
      solo_stock: this.els.chkSoloStock?.checked || false,

      unidadesDesde: this.state.filtros.unidadesDesde
        ? parseInt(this.state.filtros.unidadesDesde)
        : null,
      unidadesHasta: this.state.filtros.unidadesHasta
        ? parseInt(this.state.filtros.unidadesHasta)
        : null,
    };

    if (this.state.currentAbort) this.state.currentAbort.abort();
    this.state.currentAbort = new AbortController();

    this.setSearchStatus("Buscando…", "blue");
    ORB.setLoading?.(true);

    if (this.els.resultsStatus)
      this.els.resultsStatus.textContent = "Buscando…";

    try {
      const res = await fetch(this.config.backendUrl + "/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.state.currentAbort.signal,
      });

      if (!res.ok) throw new Error();

      let items = (await res.json()).items || [];

      items = this.filtrarPorUnidadesLocal(items);

      this.state.items = items;

      this.renderResultados(items);
      window.actualizarDashboard?.(items);
      this.actualizarIndicadores(items);

      this.setConnectionStatus(true);
      this.setOrbIdle();
      this.setSearchStatus("Conectado", "green");

      if (this.els.resultsStatus)
        this.els.resultsStatus.textContent = `${items.length} resultados`;
    } catch (err) {
      if (err.name === "AbortError") return;

      this.setConnectionStatus(false);
      ORB.setError?.(true);
      this.setSearchStatus("Error de conexión", "red");

      if (this.els.resultsStatus)
        this.els.resultsStatus.textContent = "Error de conexión";
    } finally {
      ORB.setLoading?.(false);
    }
  },
  },

  // ============================================================
  // RENDER DE RESULTADOS
  // ============================================================
  renderResultados(items) {
    if (!this.els.resultsContainer) return;

    this.els.resultsContainer.innerHTML = "";

    if (!items || !items.length) {
      this.els.resultsContainer.innerHTML =
        `<div class="result-item">Sin resultados</div>`;
      return;
    }

    if (this.state.vistaActual === "tabla") {
      this.renderTabla(items);
      return;
    }

    if (this.state.vistaActual === "articulo") {
      this.renderArticulo(items[0]);
      return;
    }

    // Vista tarjeta (default)
    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "result-item";
      div.innerHTML = `
        <div class="result-title">${item.descripcion || "—"}</div>
        <div class="result-sub">${item.marca || "—"} — ${item.rubro || "—"}</div>
      `;
      div.addEventListener("click", () => {
        this.state.vistaActual = "articulo";
        this.renderResultados([item]);
      });
      this.els.resultsContainer.appendChild(div);
    });
  },

  // ============================================================
  // RENDER TABLA
  // ============================================================
  renderTabla(items) {
    if (!this.els.resultsContainer) return;

    const wrapper = document.createElement("div");
    wrapper.className = "tabla-wrapper";

    const table = document.createElement("table");
    table.className = "tabla-resultados";

    table.innerHTML = `
      <thead>
        <tr>
          <th>Código</th>
          <th>Descripción</th>
          <th>Marca</th>
          <th>Rubro</th>
          <th>Stock</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map((it) => {
            const total = (it.talles || []).reduce(
              (acc, t) => acc + Number(t.stock || 0),
              0
            );
            return `
              <tr>
                <td>${it.codigo}</td>
                <td>${it.descripcion}</td>
                <td>${it.marca}</td>
                <td>${it.rubro}</td>
                <td>${total}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    `;

    wrapper.appendChild(table);
    this.els.resultsContainer.appendChild(wrapper);
  },

  // ============================================================
  // RENDER ARTÍCULO (DETALLE)
  // ============================================================
  renderArticulo(item) {
    if (!item || !this.els.resultsContainer) return;

    this.els.resultsContainer.innerHTML = "";

    const card = document.createElement("div");
    card.className = "detalle-card";

    card.innerHTML = `
      <div class="detalle-title">${item.descripcion || "—"}</div>
      <div class="detalle-sub">${item.marca || "—"} — ${item.rubro || "—"}</div>

      <div class="detalle-section-title">Talles</div>
      <div class="detalle-talles">
        ${(item.talles || [])
          .map((t) => `Talle ${t.talle}: ${t.stock}`)
          .join("<br>")}
      </div>

      <button class="btn-copy">Copiar</button>
    `;

    card.querySelector(".btn-copy").addEventListener("click", () => {
      this.copiarResultados();
    });

    this.els.resultsContainer.appendChild(card);
  },

  // ============================================================
  // INDICADORES SUPERIORES
  // ============================================================
  actualizarIndicadores(items) {
    if (!items) items = [];

    const totalArt = items.length;
    const totalPares = items.reduce(
      (acc, it) =>
        acc +
        (it.talles || []).reduce((a, t) => a + Number(t.stock || 0), 0),
      0
    );

    const negativos = items.filter((it) => {
      const sum = (it.talles || []).reduce(
        (a, t) => a + Number(t.stock || 0),
        0
      );
      return sum < 0;
    }).length;

    const cero = items.filter((it) => {
      const sum = (it.talles || []).reduce(
        (a, t) => a + Number(t.stock || 0),
        0
      );
      return sum === 0;
    }).length;

    const valorizado = items.reduce((acc, it) => {
      return acc + Number(it.precio || 0);
    }, 0);

    if (this.els.metricArticulos)
      this.els.metricArticulos.textContent = totalArt;

    if (this.els.metricPares)
      this.els.metricPares.textContent = totalPares;

    if (this.els.metricAlertasNegativos)
      this.els.metricAlertasNegativos.textContent = negativos;

    if (this.els.metricAlertasCero)
      this.els.metricAlertasCero.textContent = cero;

    if (this.els.metricValorizado)
      this.els.metricValorizado.textContent =
        "$" + this.formatNumber(valorizado);
  },

  // ============================================================
  // COPIAR RESULTADOS
  // ============================================================
  copiarResultados() {
    if (!this.state.items.length) {
      this.showToast("No hay resultados para copiar");
      return;
    }

    let txt = "";
    this.state.items.forEach((item) => {
      txt += `${item.codigo} — ${item.descripcion} — ${item.marca} — ${item.rubro}\n`;
      (item.talles || []).forEach((t) => {
        txt += `  Talle ${t.talle}: ${t.stock}\n`;
      });
      txt += "\n";
    });

    navigator.clipboard.writeText(txt);
    this.showToast("Copiado");
  },

  // ============================================================
  // STOP TODO
  // ============================================================
  stopTodo() {
    if (this.state.currentAbort) this.state.currentAbort.abort();

    try {
      speechSynthesis.cancel();
    } catch (_) {}

    ORB.setError?.(false);
    ORB.setLoading?.(false);
    this.setSearchStatus("Listo", "blue");
  },

  // ============================================================
  // VOZ — LECTURA DE RESULTADOS
  // ============================================================
  speakResultados() {
    if (!("speechSynthesis" in window)) return;
    if (!this.state.items.length) return;

    const top = this.state.items.slice(0, 5);
    let text = "Resultados de stock. ";

    top.forEach((item) => {
      text += `${item.descripcion || "Artículo"} de marca ${
        item.marca || "sin marca"
      }, rubro ${item.rubro || "sin rubro"}. `;
    });

    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "es-AR";
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
    } catch (_) {}
  },

  // ============================================================
  // LIMPIAR PANTALLA
  // ============================================================
  limpiarPantalla() {
    this.state.items = [];

    this.renderResultados([]);
    window.actualizarDashboard?.([]);
    this.actualizarIndicadores([]);

    if (this.els.resultsStatus)
      this.els.resultsStatus.textContent = "Sin resultados";

    if (this.els.searchInput) this.els.searchInput.value = "";

    this.setOrbIdle();
    this.setSearchStatus("Listo", "blue");
  },
  },

  // ============================================================
  // EVENTOS DE UI
  // ============================================================
  conectarEventosUI() {
    // Aplicar filtros
    this.els.btnAplicarFiltros?.addEventListener("click", () => {
      this.buscarPorFiltros();
    });

    // Enter en búsqueda
    this.els.searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.buscar();
    });

    // Copiar
    document.getElementById("btn-copiar")?.addEventListener("click", () =>
      this.copiarResultados()
    );

    // Limpiar
    document.getElementById("btn-limpiar")?.addEventListener("click", () =>
      this.limpiarPantalla()
    );

    // Stop
    document.getElementById("btn-stop")?.addEventListener("click", () =>
      this.stopTodo()
    );

    // ============================================================
    // TOGGLES DE PANELES
    // ============================================================

    // Ayuda
    const helpOverlay = document.querySelector(".help-overlay");
    const helpClose = document.querySelector(".help-close");

    document.querySelector(".btn-help")?.addEventListener("click", () => {
      if (helpOverlay) helpOverlay.style.display = "flex";
    });

    helpClose?.addEventListener("click", () => {
      if (helpOverlay) helpOverlay.style.display = "none";
    });

    // Filtros avanzados
    document.getElementById("btnFiltros")?.addEventListener("click", () => {
      toggle("#filtros-panel");
    });

    // Results-card
    document.getElementById("btnResultados")?.addEventListener("click", () => {
      toggle(".results-card");
    });

    // Dashboard-card
    document.getElementById("btnDashboard")?.addEventListener("click", () => {
      toggle(".dashboard-card");
    });

    // Panel Admin — condición ADMIN
    const adminPanel = document.querySelector(".admin-panel");
    this.els.searchInput?.addEventListener("input", (e) => {
      if (!adminPanel) return;
      if (e.target.value.trim().toUpperCase() === "ADMIN") {
        adminPanel.style.display = "block";
      }
    });

    // Panel Admin — 7 clics al ORB
    let orbClicks = 0;
    const orbCore = document.getElementById("orb-core");
    orbCore?.addEventListener("click", () => {
      if (!adminPanel) return;
      orbClicks++;
      if (orbClicks >= 7) {
        adminPanel.style.display = "block";
        orbClicks = 0;
      }
    });
  },

  // ============================================================
  // INIT
  // ============================================================
  init() {
    this.setSearchStatus("Activando servidor…", "orange");
    this.warmUpLoop();
    this.conectarEventosUI();
  },
};

// ============================================================
// BADGE DE VERSIÓN
// ============================================================
function inicializarBadgeVersion() {
  const badge = document.getElementById("version-badge");
  const meta = document.querySelector('meta[name="build-version"]');

  if (!badge || !meta) return;

  const version = meta.getAttribute("content") || "v0.0.0";
  badge.textContent = version;
}

// ============================================================
// INSTANCIA GLOBAL
// ============================================================
window.appCore = AppCore;

window.addEventListener("DOMContentLoaded", () => {
  appCore.init();
  inicializarBadgeVersion();
  inicializarSistemaActualizacion();
});

/* ============================================================
   SISTEMA DE ACTUALIZACIÓN — Optimizado
   ============================================================ */
function inicializarSistemaActualizacion() {
  if (!("serviceWorker" in navigator)) return;

  let newWorker = null;

  navigator.serviceWorker
    .register("service-worker.js")
    .then((reg) => {
      reg.addEventListener("updatefound", () => {
        newWorker = reg.installing;

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            mostrarAvisoActualizacion(newWorker);
          }
        });
      });
    })
    .catch((err) => {
      console.warn("Error registrando SW:", err);
    });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });
}

function mostrarAvisoActualizacion(newWorker) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <span>Nueva versión disponible</span>
      <button id="btn-update-now" 
        style="
          padding:8px 12px;
          background:#2563eb;
          color:white;
          border:none;
          border-radius:6px;
          cursor:pointer;
        ">
        Actualizar ahora
      </button>
    </div>
  `;

  toast.classList.add("show");

  document.getElementById("btn-update-now").onclick = () => {
    newWorker.postMessage({ action: "skipWaiting" });
  };
}

// ============================================================
// CAPTURA GLOBAL DE ERRORES
// ============================================================
window.addEventListener("error", (e) => {
  console.error("ERROR GLOBAL:", e.message, e.filename, e.lineno);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("PROMISE ERROR:", e.reason);
});
