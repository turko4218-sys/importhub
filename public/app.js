const jobListEl = document.getElementById("job-list");
const editorEl = document.getElementById("editor");
const importForm = document.getElementById("import-form");
const importUrlInput = document.getElementById("import-url");
const importStatusEl = document.getElementById("import-status");

let currentJobId = null;
let pollTimer = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.error || `HTTP ${response.status}`);
  return body;
}

function statusLabel(status) {
  const labels = {
    queued: "En cola",
    scraping: "Scrapeando",
    scraped: "Listo para revisar",
    publishing: "Publicando",
    published: "Publicado",
    expanded: "Lista expandida",
    failed: "Fallo",
  };
  return labels[status] || status;
}

async function refreshJobList() {
  const { jobs } = await api("/api/jobs?limit=50");
  jobListEl.innerHTML = "";
  for (const job of jobs) {
    const li = document.createElement("li");
    li.className = job.id === currentJobId ? "active" : "";
    let title = job.product?.title || job.url;
    let badgeText = statusLabel(job.status);
    if (job.kind === "listing") {
      title = `📋 Lista: ${job.url}`;
      if (job.status === "expanded") badgeText = `${job.childJobIds?.length ?? 0} productos encolados`;
    }
    li.innerHTML = `
      <span class="status-badge status-${job.status}">${escapeHtml(badgeText)}</span>
      <span class="title">${escapeHtml(title)}</span>
    `;
    li.addEventListener("click", () => selectJob(job.id));
    jobListEl.appendChild(li);
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function renderEmptyEditor() {
  editorEl.innerHTML = '<p class="empty-state">Importa una URL de Amazon o elegi un job de la lista para editarlo.</p>';
}

function renderListingSummary(job) {
  const parts = [`<h2>Página con varios productos</h2>`, `<p class="hint">${escapeHtml(job.url)}</p>`];

  if (job.status === "queued" || job.status === "scraping") {
    parts.push(`<p>Buscando productos en esa página...</p>`);
  } else if (job.status === "failed") {
    parts.push(`<p class="hint error">Error: ${escapeHtml(job.error || "desconocido")}</p>`);
  } else if (job.status === "expanded") {
    const ids = job.childJobIds || [];
    parts.push(`<p>Se encontraron y encolaron <strong>${ids.length}</strong> productos. Hacé clic en cada uno en la lista de la izquierda para revisarlo y publicarlo.</p>`);
  }

  editorEl.innerHTML = parts.join("\n");
}

function renderEditor(job) {
  if (job.kind === "listing") {
    renderListingSummary(job);
    return;
  }

  const template = document.getElementById("editor-template");
  editorEl.innerHTML = "";
  editorEl.appendChild(template.content.cloneNode(true));

  const listing = job.listing;
  const set = (field, value) => {
    const el = editorEl.querySelector(`[data-field="${field}"]`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value ?? "";
  };

  set("title", listing?.title);
  set("url", job.url);
  set("asin", job.product?.asin);
  set("brand", listing?.brand);
  set("model", listing?.model);
  set("barcode", listing?.barcode);
  set("priceUsd", listing?.priceUsd);
  set("weightKg", listing?.weightKg);
  set("shippingCostUsd", listing?.shippingCostUsd);
  set("availableOnAmazon", listing?.availableOnAmazon);
  set("images", (listing?.images || []).join("\n"));
  set("description", listing?.description);
  set("videos", (listing?.videos || []).join("\n"));

  renderThumbnails(listing?.images || []);

  const imagesField = editorEl.querySelector('[data-field="images"]');
  imagesField.addEventListener("input", () => {
    renderThumbnails(imagesField.value.split("\n").map((line) => line.trim()).filter(Boolean));
  });

  const statusEl = editorEl.querySelector("#editor-status");
  const resultEl = editorEl.querySelector("#ml-result");

  if (job.status === "failed" && job.error) {
    statusEl.textContent = `Error: ${job.error}`;
    statusEl.className = "hint error";
  } else if (!listing) {
    statusEl.textContent = `Estado actual: ${statusLabel(job.status)}. Todavia no hay datos para editar.`;
  } else if (job.status === "published" && job.mercadolibre?.permalink) {
    resultEl.innerHTML = `Publicado: <a href="${job.mercadolibre.permalink}" target="_blank" rel="noopener">${job.mercadolibre.permalink}</a>`;
  }

  editorEl.querySelector("#save-btn").addEventListener("click", () => saveListing(job.id));
  editorEl.querySelector("#publish-btn").addEventListener("click", () => publishJob(job.id));
}

function renderThumbnails(urls) {
  const container = editorEl.querySelector("#thumbnails");
  if (!container) return;
  container.innerHTML = "";
  for (const url of urls.slice(0, 12)) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    container.appendChild(img);
  }
}

function readListingFromForm() {
  const get = (field) => editorEl.querySelector(`[data-field="${field}"]`);
  const numberOrNull = (value) => (value === "" || value === null ? null : Number(value));

  return {
    title: get("title").value,
    brand: get("brand").value || null,
    model: get("model").value || null,
    barcode: get("barcode").value || null,
    priceUsd: numberOrNull(get("priceUsd").value),
    weightKg: numberOrNull(get("weightKg").value),
    shippingCostUsd: numberOrNull(get("shippingCostUsd").value),
    availableOnAmazon: get("availableOnAmazon").checked,
    images: get("images").value.split("\n").map((line) => line.trim()).filter(Boolean),
    description: get("description").value,
  };
}

async function saveListing(jobId) {
  const statusEl = editorEl.querySelector("#editor-status");
  statusEl.className = "hint";
  statusEl.textContent = "Guardando...";
  try {
    const { job } = await api(`/api/jobs/${jobId}/listing`, {
      method: "PATCH",
      body: JSON.stringify(readListingFromForm()),
    });
    statusEl.className = "hint ok";
    statusEl.textContent = "Cambios guardados.";
    await refreshJobList();
    return job;
  } catch (error) {
    statusEl.className = "hint error";
    statusEl.textContent = `No se pudo guardar: ${error.message}`;
    throw error;
  }
}

async function publishJob(jobId) {
  const statusEl = editorEl.querySelector("#editor-status");
  const resultEl = editorEl.querySelector("#ml-result");
  try {
    await saveListing(jobId);
    statusEl.className = "hint";
    statusEl.textContent = "Publicando en MercadoLibre...";
    const { job } = await api(`/api/jobs/${jobId}/publish`, { method: "POST" });
    statusEl.className = "hint ok";
    statusEl.textContent = "¡Publicado!";
    resultEl.innerHTML = `Publicado: <a href="${job.mercadolibre.permalink}" target="_blank" rel="noopener">${job.mercadolibre.permalink}</a>`;
    await refreshJobList();
  } catch (error) {
    statusEl.className = "hint error";
    statusEl.textContent = `No se pudo publicar: ${error.message}`;
  }
}

async function selectJob(jobId) {
  currentJobId = jobId;
  const { job } = await api(`/api/jobs/${jobId}`);
  renderEditor(job);
  await refreshJobList();

  if (job.status === "queued" || job.status === "scraping") {
    schedulePoll(jobId);
  }
}

function schedulePoll(jobId) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    const { job } = await api(`/api/jobs/${jobId}`);
    if (jobId === currentJobId) renderEditor(job);
    await refreshJobList();
    if (job.status === "queued" || job.status === "scraping") schedulePoll(jobId);
  }, 2000);
}

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = importUrlInput.value.trim();
  if (!url) return;

  importStatusEl.className = "hint";
  importStatusEl.textContent = "Encolando...";
  try {
    const { job } = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ url, autoPublish: false }),
    });
    importUrlInput.value = "";
    importStatusEl.className = "hint ok";
    importStatusEl.textContent = "Importando, en unos segundos aparece para editar.";
    await refreshJobList();
    await selectJob(job.id);
  } catch (error) {
    importStatusEl.className = "hint error";
    importStatusEl.textContent = `Error: ${error.message}`;
  }
});

renderEmptyEditor();
refreshJobList();
setInterval(refreshJobList, 8000);
