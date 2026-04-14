const URL_BASE_DATOS_JSON = "./csvjson.json";
const URL_BASE_PLANTILLAS = "./";
const TEMPLATE_FILES = [
    "cisco-centro.txt",
    "cisco-norte.txt",
    "cisco-oriente.txt",
    "cisco-poniente.txt",
    "cisco-sur.txt",
    "huawei-centro.txt",
    "huawei-norte.txt",
    "huawei-oriente.txt",
    "huawei-poniente.txt",
    "huawei-sur.txt"
];

const form = document.getElementById("config-form");
const modeloSelect = document.getElementById("modelo");
const c2Select = document.getElementById("c2");
const idInput = document.getElementById("id_tmx");
const idSuggestions = document.getElementById("id-suggestions");
const idFeedback = document.getElementById("id-feedback");
const submitBtn = document.getElementById("submit-btn");
const btnText = submitBtn.querySelector(".btn-text");
const btnLabel = submitBtn.querySelector(".btn-label");
const statusMessage = document.getElementById("status-message");
const dataIssuesPanel = document.getElementById("data-issues");
const dataIssuesList = document.getElementById("data-issues-list");

const toggleBtn = document.getElementById("toggle-mass");
const massPanel = document.getElementById("mass-panel");
const txtLista = document.getElementById("lista-ids");
const massSummary = document.getElementById("mass-summary");
const massDetail = document.getElementById("mass-detail");
const btnLista = document.getElementById("btn-lista");
const btnLimpiar = document.getElementById("btn-limpiar");
const statusMass = document.getElementById("status-mass");
const massProgress = document.getElementById("mass-progress");
const massProgressBar = document.getElementById("mass-progress-bar");
const massProgressText = document.getElementById("mass-progress-text");

let database = new Map();
let allIds = [];
let templatesCache = {};
let requiredTemplateFields = [];
let missingFieldsById = new Map();
let duplicateIds = [];
let suggestedIds = [];
let selectedSuggestionIndex = -1;

function setStatus(element, message, type = "info") {
    element.textContent = message;
    element.className = `status-box ${type} visible`;
}

function hideStatus(element) {
    element.textContent = "";
    element.className = "status-box";
}

function setFieldFeedback(message, type = "info") {
    idFeedback.textContent = message;
    idFeedback.className = `field-feedback ${type}`;
}

function hideFieldFeedback() {
    idFeedback.textContent = "";
    idFeedback.className = "field-feedback hidden";
}

function limpiarValorJS(valor, campo) {
    if (valor === null || valor === undefined) return null;

    let valorStr = String(valor).trim();
    if (valorStr === "") return null;

    if (campo === "VLAN_T" || campo === "VLAN_R") {
        const num = parseInt(valorStr, 10);
        return Number.isNaN(num) ? null : String(num);
    }

    if (valorStr.endsWith(".0") && /^\d+\.0$/.test(valorStr)) {
        return valorStr.substring(0, valorStr.length - 2);
    }

    return valorStr;
}

function obtenerNombrePlantilla(modelo, c2) {
    return `${modelo.toLowerCase()}-${c2.toLowerCase()}.txt`;
}

function obtenerExtension(modelo) {
    return modelo === "Cisco" ? "txt" : "cfg";
}

function extraerPlaceholders(texto) {
    return [...texto.matchAll(/«([^»]+)»/g)].map((match) => match[1]);
}

function dispararDescarga(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = nombreArchivo;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function llenarCamposJS(plantilla, datos) {
    return plantilla.replace(/«([^»]+)»/g, (matchOriginal, campo) => {
        return datos[campo] !== null && datos[campo] !== undefined ? datos[campo] : matchOriginal;
    });
}

function obtenerIdsDesdeTexto(texto) {
    return texto
        .split(/[\s,;]+/)
        .map((valor) => valor.trim())
        .filter((valor) => valor !== "");
}

function deduplicarPreservandoOrden(valores) {
    return [...new Set(valores)];
}

function normalizarListaIds(texto) {
    const ids = deduplicarPreservandoOrden(obtenerIdsDesdeTexto(texto));
    return {
        ids,
        text: ids.join("\n")
    };
}

function actualizarBarraProgreso(actual, total, mensaje = "") {
    if (!total) {
        massProgress.classList.remove("visible");
        massProgressText.classList.remove("visible");
        massProgressBar.style.width = "0%";
        massProgressText.textContent = "";
        return;
    }

    const porcentaje = Math.round((actual / total) * 100);
    massProgress.classList.add("visible");
    massProgressText.classList.add("visible");
    massProgressBar.style.width = `${porcentaje}%`;
    massProgressText.textContent = mensaje || `Procesando ${actual} de ${total}...`;
}

function ocultarSugerenciasIds() {
    idSuggestions.innerHTML = "";
    idSuggestions.classList.add("hidden");
    suggestedIds = [];
    selectedSuggestionIndex = -1;
}

function aplicarSugerenciaId(id) {
    idInput.value = id;
    ocultarSugerenciasIds();
    validarIdIndividual();
}

function resaltarSugerenciaActiva() {
    const items = idSuggestions.querySelectorAll(".autocomplete-item");
    items.forEach((item, index) => {
        item.classList.toggle("active", index === selectedSuggestionIndex);
    });
}

function renderizarSugerenciasIds(query) {
    const texto = query.trim();

    if (texto.length < 3) {
        ocultarSugerenciasIds();
        return;
    }

    suggestedIds = allIds
        .filter((id) => id.startsWith(texto))
        .slice(0, 20);

    if (suggestedIds.length === 0) {
        ocultarSugerenciasIds();
        return;
    }

    selectedSuggestionIndex = -1;
    idSuggestions.innerHTML = "";

    suggestedIds.forEach((id, index) => {
        const item = document.createElement("div");
        item.className = "autocomplete-item";
        item.textContent = id;
        item.dataset.index = String(index);
        item.addEventListener("mousedown", (event) => {
            event.preventDefault();
            aplicarSugerenciaId(id);
        });
        idSuggestions.appendChild(item);
    });

    const coincidenciasTotales = allIds.filter((id) => id.startsWith(texto)).length;
    const meta = document.createElement("div");
    meta.className = "autocomplete-meta";
    meta.textContent = coincidenciasTotales > suggestedIds.length
        ? `Mostrando ${suggestedIds.length} de ${coincidenciasTotales} coincidencias. Sigue escribiendo para acotar.`
        : `${coincidenciasTotales} coincidencia(s).`;
    idSuggestions.appendChild(meta);
    idSuggestions.classList.remove("hidden");
}

function renderizarPanelDeDatos(issues) {
    dataIssuesList.innerHTML = "";

    if (issues.length === 0) {
        dataIssuesPanel.querySelector("h3").textContent = "Revision de datos";
        dataIssuesList.innerHTML = "<li>No se detectaron inconsistencias en el JSON ni en las plantillas.</li>";
        dataIssuesPanel.className = "issues-panel success visible";
        return;
    }

        dataIssuesPanel.querySelector("h3").textContent = "Notas de revision";
    issues.forEach((issue) => {
        const item = document.createElement("li");
        item.textContent = issue;
        dataIssuesList.appendChild(item);
    });
    dataIssuesPanel.className = "issues-panel info visible";
}

function construirResumenDeDatos(analisis, templateWarnings) {
    const issues = [...templateWarnings];

    if (analisis.duplicateIds.length > 0) {
        const ejemplos = analisis.duplicateIds.slice(0, 8).map((item) => `${item.id} (${item.count})`).join(", ");
        issues.push(`Se detecto ${analisis.duplicateIds.length} ID(s) repetido(s) en el JSON. Ejemplos: ${ejemplos}. Para la pagina se tomara la ultima coincidencia cargada.`);
    }

    if (analisis.rowsWithoutId > 0) {
        issues.push(`Hay ${analisis.rowsWithoutId} registro(s) sin ID_TMX y se ignoraran.`);
    }

    if (analisis.missingRequiredCount > 0) {
        const ejemplos = analisis.missingRequiredExamples
            .map((item) => `${item.id}: ${item.fields.join(", ")}`)
            .join(" | ");
        issues.push(`Hay ${analisis.missingRequiredCount} ID(s) con campos faltantes usados por las plantillas. Ejemplos: ${ejemplos}.`);
    }

    return issues;
}

function analizarBaseDeDatos(dataArray) {
    const nextDatabase = new Map();
    const seenCounts = new Map();
    const nextMissingFieldsById = new Map();
    const missingRequiredExamples = [];
    let rowsWithoutId = 0;
    let missingRequiredCount = 0;

    dataArray.forEach((row) => {
        const rawId = row?.ID_TMX;
        const id = rawId === null || rawId === undefined ? "" : String(rawId).trim();

        if (!id) {
            rowsWithoutId += 1;
            return;
        }

        const cleanedRow = {};
        Object.keys(row).forEach((key) => {
            cleanedRow[key] = limpiarValorJS(row[key], key);
        });

        seenCounts.set(id, (seenCounts.get(id) || 0) + 1);
        nextDatabase.set(id, cleanedRow);

        const missingFields = requiredTemplateFields.filter((field) => {
            const value = cleanedRow[field];
            return value === null || value === undefined || String(value).trim() === "";
        });

        if (missingFields.length > 0) {
            nextMissingFieldsById.set(id, missingFields);
        } else {
            nextMissingFieldsById.delete(id);
        }
    });

    nextMissingFieldsById.forEach((fields, id) => {
        missingRequiredCount += 1;
        if (missingRequiredExamples.length < 6) {
            missingRequiredExamples.push({ id, fields });
        }
    });

    const duplicateList = [...seenCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([id, count]) => ({ id, count }));

    return {
        database: nextDatabase,
        duplicateIds: duplicateList,
        rowsWithoutId,
        missingRequiredCount,
        missingRequiredExamples,
        missingFieldsById: nextMissingFieldsById
    };
}

async function cargarPlantillas() {
    const templateWarnings = [];
    const placeholders = new Set();
    const entries = await Promise.all(
        TEMPLATE_FILES.map(async (name) => {
            const response = await fetch(`${URL_BASE_PLANTILLAS}${name}`);
            if (!response.ok) {
                throw new Error(`No se pudo cargar la plantilla ${name}.`);
            }
            const text = await response.text();
            templatesCache[name] = text;
            const foundPlaceholders = extraerPlaceholders(text);
            if (foundPlaceholders.length === 0) {
                templateWarnings.push(`La plantilla ${name} no contiene placeholders detectables.`);
            }
            foundPlaceholders.forEach((field) => placeholders.add(field));
        })
    );

    requiredTemplateFields = [...placeholders].sort();
    return { templateWarnings, entriesLoaded: entries.length };
}

function validarIdIndividual() {
    const id = idInput.value.trim();

    if (!id) {
        hideFieldFeedback();
        return false;
    }

    if (!database.has(id)) {
        setFieldFeedback("ID no encontrado en la base de datos.", "error");
        return false;
    }

    const missingFields = missingFieldsById.get(id);
    if (missingFields?.length) {
        setFieldFeedback(`ID encontrado, pero faltan campos: ${missingFields.join(", ")}.`, "warning");
        return false;
    }

    setFieldFeedback("ID valido y listo para generar.", "success");
    return true;
}

function actualizarResumenMasivo() {
    const ids = deduplicarPreservandoOrden(obtenerIdsDesdeTexto(txtLista.value));

    if (ids.length === 0) {
        massSummary.textContent = "Aun no has pegado IDs.";
        massDetail.textContent = "Acepta IDs separados por comas, espacios, saltos de linea o pegado desde Excel.";
        return;
    }

    let encontrados = 0;
    const noEncontrados = [];

    ids.forEach((id) => {
        if (database.has(id)) {
            encontrados += 1;
        } else {
            noEncontrados.push(id);
        }
    });

    const modelo = modeloSelect.value || "sin modelo";
    const c2 = c2Select.value || "sin C2";

    massSummary.textContent = `IDs unicos detectados: ${ids.length}. Validos: ${encontrados}. No encontrados: ${noEncontrados.length}. Se usara ${modelo} / ${c2}.`;

    if (noEncontrados.length > 0) {
        massDetail.textContent = `IDs no encontrados: ${noEncontrados.slice(0, 10).join(", ")}${noEncontrados.length > 10 ? "..." : ""}`;
    } else {
        massDetail.textContent = "La lista se limpiara automaticamente para eliminar duplicados y separadores de Excel.";
    }
}

function normalizarTextareaIds() {
    const normalized = normalizarListaIds(txtLista.value);
    txtLista.value = normalized.text;
    actualizarResumenMasivo();
}

async function cargarBaseDeDatos() {
    btnLabel.textContent = "Cargando datos...";
    submitBtn.disabled = true;
    btnLista.disabled = true;
    btnLimpiar.disabled = true;

    setStatus(statusMessage, "Cargando base de datos y plantillas locales...", "info");

    try {
        const [response, templatesMeta] = await Promise.all([
            fetch(URL_BASE_DATOS_JSON),
            cargarPlantillas()
        ]);

        if (!response.ok) {
            throw new Error(`No se pudo cargar csvjson.json (HTTP ${response.status}).`);
        }

        const dataArray = await response.json();
        const analysis = analizarBaseDeDatos(dataArray);

        database = analysis.database;
        duplicateIds = analysis.duplicateIds;
        missingFieldsById = analysis.missingFieldsById;
        allIds = [...database.keys()].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

        actualizarResumenMasivo();

        const issues = construirResumenDeDatos(analysis, templatesMeta.templateWarnings);
        renderizarPanelDeDatos(issues);

        btnLabel.textContent = "Generar plantilla";
        submitBtn.disabled = false;
        btnLista.disabled = false;
        btnLimpiar.disabled = false;

        if (issues.length === 0) {
            setStatus(statusMessage, `Base de datos conectada: ${database.size} IDs disponibles.`, "success");
        } else {
            setStatus(statusMessage, `Base de datos cargada correctamente. Hay ${issues.length} nota(s) de revision disponibles en el panel.`, "info");
        }
    } catch (error) {
        console.error(error);
        btnLabel.textContent = "Sin conexion";
        setStatus(statusMessage, `Error de conexion: ${error.message}`, "error");
    }
}

function obtenerPlantilla(modelo, c2) {
    const templateName = obtenerNombrePlantilla(modelo, c2);
    const template = templatesCache[templateName];

    if (!template) {
        throw new Error(`No existe plantilla para ${modelo} / ${c2}.`);
    }

    return template;
}

async function generarArchivoIndividual(event) {
    event.preventDefault();

    if (!database.size) {
        setStatus(statusMessage, "La base de datos aun no esta disponible.", "error");
        return;
    }

    const id = idInput.value.trim();
    const modelo = modeloSelect.value;
    const c2 = c2Select.value;

    if (!id || !modelo || !c2) {
        setStatus(statusMessage, "Completa Modelo, C2 e ID antes de generar.", "warning");
        validarIdIndividual();
        return;
    }

    if (!validarIdIndividual()) {
        setStatus(statusMessage, "Corrige el ID antes de generar el archivo.", "error");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add("loading");

    try {
        const plantillaBase = obtenerPlantilla(modelo, c2);
        const datosRouter = database.get(id);
        const configFinal = llenarCamposJS(plantillaBase, datosRouter);
        const placeholdersPendientes = deduplicarPreservandoOrden(extraerPlaceholders(configFinal));

        if (placeholdersPendientes.length > 0) {
            throw new Error(`El ID ${id} tiene campos sin valor: ${placeholdersPendientes.join(", ")}.`);
        }

        const blob = new Blob([configFinal], { type: "text/plain;charset=utf-8" });
        dispararDescarga(blob, `${id}_${c2}.${obtenerExtension(modelo)}`);
        setStatus(statusMessage, "Archivo generado correctamente.", "success");
    } catch (error) {
        console.error(error);
        setStatus(statusMessage, `Error al generar: ${error.message}`, "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove("loading");
    }
}

async function cederControlAlNavegador() {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

async function generarMasivo() {
    if (!database.size) {
        setStatus(statusMass, "La base de datos aun no esta disponible.", "error");
        return;
    }

    if (typeof JSZip === "undefined") {
        setStatus(statusMass, "JSZip local no esta disponible.", "error");
        return;
    }

    const modelo = modeloSelect.value;
    const c2 = c2Select.value;

    if (!modelo || !c2) {
        setStatus(statusMass, "Selecciona el Modelo y el C2 antes de generar el ZIP.", "warning");
        return;
    }

    const normalized = normalizarListaIds(txtLista.value);
    txtLista.value = normalized.text;

    if (normalized.ids.length === 0) {
        setStatus(statusMass, "Pega uno o varios ID_TMX para usar el modo masivo.", "warning");
        actualizarResumenMasivo();
        return;
    }

    btnLista.disabled = true;
    btnLimpiar.disabled = true;
    actualizarBarraProgreso(0, normalized.ids.length, "Preparando generacion masiva...");
    setStatus(statusMass, `Iniciando generacion de ${normalized.ids.length} ID(s)...`, "info");

    const zip = new JSZip();
    const plantillaBase = obtenerPlantilla(modelo, c2);
    const idsNoEncontrados = [];
    const idsConCamposFaltantes = [];
    let contExito = 0;

    try {
        for (let index = 0; index < normalized.ids.length; index += 1) {
            const id = normalized.ids[index];
            const datos = database.get(id);

            actualizarBarraProgreso(
                index + 1,
                normalized.ids.length,
                `Procesando ${index + 1} de ${normalized.ids.length}...`
            );

            if (!datos) {
                idsNoEncontrados.push(id);
                if ((index + 1) % 20 === 0 || index === normalized.ids.length - 1) {
                    await cederControlAlNavegador();
                }
                continue;
            }

            const config = llenarCamposJS(plantillaBase, datos);
            const placeholdersPendientes = deduplicarPreservandoOrden(extraerPlaceholders(config));

            if (placeholdersPendientes.length > 0) {
                idsConCamposFaltantes.push(`${id} (${placeholdersPendientes.join(", ")})`);
                if ((index + 1) % 20 === 0 || index === normalized.ids.length - 1) {
                    await cederControlAlNavegador();
                }
                continue;
            }

            zip.file(`${id}_${c2}.${obtenerExtension(modelo)}`, config);
            contExito += 1;

            if ((index + 1) % 20 === 0 || index === normalized.ids.length - 1) {
                await cederControlAlNavegador();
            }
        }

        if (contExito === 0) {
            throw new Error("No se pudo generar ninguna plantilla valida.");
        }

        actualizarBarraProgreso(normalized.ids.length, normalized.ids.length, "Comprimiendo ZIP final...");
        const content = await zip.generateAsync({ type: "blob" });
        dispararDescarga(content, `Pack_${modelo}_${c2}.zip`);

        const detalles = [
            `${contExito} config(s) generadas`,
            `${idsNoEncontrados.length} ID(s) no encontrados`,
            `${idsConCamposFaltantes.length} ID(s) con campos faltantes`
        ];

        setStatus(statusMass, `Listo: ${detalles.join(" | ")}.`, "success");
    } catch (error) {
        console.error(error);
        setStatus(statusMass, `Error en modo masivo: ${error.message}`, "error");
    } finally {
        btnLista.disabled = false;
        btnLimpiar.disabled = false;
        setTimeout(() => actualizarBarraProgreso(0, 0), 600);
        actualizarResumenMasivo();
    }
}

function limpiarListaMasiva() {
    txtLista.value = "";
    actualizarResumenMasivo();
    hideStatus(statusMass);
    actualizarBarraProgreso(0, 0);
}

function manejarToggleMasivo() {
    massPanel.classList.toggle("open");
    toggleBtn.classList.toggle("open");

    if (massPanel.classList.contains("open")) {
        toggleBtn.style.background = "rgba(255,255,255,0.1)";
    } else {
        toggleBtn.style.background = "transparent";
    }
}

form.addEventListener("submit", generarArchivoIndividual);
toggleBtn.addEventListener("click", manejarToggleMasivo);
txtLista.addEventListener("input", actualizarResumenMasivo);
txtLista.addEventListener("blur", normalizarTextareaIds);
txtLista.addEventListener("paste", () => {
    setTimeout(normalizarTextareaIds, 0);
});
btnLista.addEventListener("click", generarMasivo);
btnLimpiar.addEventListener("click", limpiarListaMasiva);
idInput.addEventListener("blur", validarIdIndividual);
idInput.addEventListener("input", () => {
    const valor = idInput.value.trim();

    if (!valor) {
        ocultarSugerenciasIds();
        hideFieldFeedback();
        return;
    }

    renderizarSugerenciasIds(valor);

    if (database.has(valor)) {
        validarIdIndividual();
        return;
    }

    if (valor.length < 3) {
        setFieldFeedback("Escribe al menos 3 digitos para ver sugerencias.", "info");
    } else {
        setFieldFeedback("Sigue escribiendo o elige un ID de la lista.", "info");
    }
});
idInput.addEventListener("keydown", (event) => {
    if (idSuggestions.classList.contains("hidden") || suggestedIds.length === 0) {
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestedIds.length - 1);
        resaltarSugerenciaActiva();
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
        resaltarSugerenciaActiva();
    }

    if (event.key === "Enter" && selectedSuggestionIndex >= 0) {
        event.preventDefault();
        aplicarSugerenciaId(suggestedIds[selectedSuggestionIndex]);
    }

    if (event.key === "Escape") {
        ocultarSugerenciasIds();
    }
});
document.addEventListener("click", (event) => {
    if (!event.target.closest(".autocomplete")) {
        ocultarSugerenciasIds();
    }
});
modeloSelect.addEventListener("change", actualizarResumenMasivo);
c2Select.addEventListener("change", actualizarResumenMasivo);

document.addEventListener("DOMContentLoaded", cargarBaseDeDatos);
