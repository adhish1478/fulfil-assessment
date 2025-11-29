// main.js - Frontend for Product Importer
// Configure your API base URL here:
//const API_BASE = (window.API_BASE || '').replace(/\/$/, '') || "http://localhost:8000/api";
const API_BASE = 'https://34.100.164.253/api';
//
// Simple API helpers
//
async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = opts.headers || {};
  if (!(opts.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const merged = {...opts, headers};
  if (merged.body && typeof merged.body === "object" && !(merged.body instanceof FormData)) {
    merged.body = JSON.stringify(merged.body);
  }
  const res = await fetch(url, merged);
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch(e) {}
  if (!res.ok) {
    throw { status: res.status, body: data };
  }
  return data;
}

//
// Utilities
//
function showNotification(msg, type = "info", timeout = 4000) {
  const id = "n" + Date.now();
  const el = document.createElement("div");
  el.id = id;
  el.className = "px-4 py-2 rounded shadow text-sm " + 
    (type === "error" ? "bg-red-100 text-red-800" : type === "success" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800");
  el.textContent = msg;
  document.getElementById("notifications").appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

function qs(selector) { return document.querySelector(selector); }
function qsa(selector) { return Array.from(document.querySelectorAll(selector)); }

//
// Navigation
//
function showView(viewId) {
  qsa(".nav-btn").forEach(b => b.classList.remove("font-semibold"));
  if (viewId === "view-upload") document.getElementById("nav-upload").classList.add("font-semibold");
  if (viewId === "view-products") document.getElementById("nav-products").classList.add("font-semibold");
  if (viewId === "view-webhooks") document.getElementById("nav-webhooks").classList.add("font-semibold");

  ["view-upload", "view-products", "view-webhooks"].forEach(id => {
    const el = document.getElementById(id);
    el.classList.toggle("hidden", id !== viewId);
  });
}

document.getElementById("nav-upload").addEventListener("click", () => showView("view-upload"));
document.getElementById("nav-products").addEventListener("click", () => {
  showView("view-products");
  productsLoadPage(1);
});
document.getElementById("nav-webhooks").addEventListener("click", () => {
  showView("view-webhooks");
  loadWebhooks();
});

//
// API status ping
//
async function checkApi() {
  try {
    await apiFetch("/products/?page=1");
    document.getElementById("api-status").textContent = "API: reachable";
  } catch (e) {
    document.getElementById("api-status").textContent = "API: unreachable";
  }
}
checkApi();

//
// Upload logic with polling progress
//
const fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-btn");
const uploadStatus = document.getElementById("upload-status");
const uploadProgress = document.getElementById("upload-progress");
const uploadStage = document.getElementById("upload-stage");
const uploadDetails = document.getElementById("upload-details");
const uploadResult = document.getElementById("upload-result");

// <-- NEW: percentage text element under the bar
const uploadPercent = document.getElementById("upload-percent");

let currentJob = null;
let pollInterval = null;

uploadBtn.addEventListener("click", async () => {
  const f = fileInput.files[0];
  if (!f) { showNotification("Select a CSV file", "error"); return; }

  const form = new FormData();
  form.append("file", f);

  try {
    uploadStatus.classList.remove("hidden");
    uploadStage.textContent = "Uploading file to server...";
    uploadProgress.style.width = "10%";
    uploadDetails.textContent = "";
    // <-- NEW: initialize percent display
    if (uploadPercent) uploadPercent.textContent = "0% completed";

    const res = await fetch(`${API_BASE}/imports/`, { method: "POST", body: form });
    const data = await res.json();
    currentJob = data.job_id;
    uploadStage.textContent = "Queued — processing started";
    startPollingProgress(currentJob);
    showNotification("Upload started. Tracking progress...");
  } catch (err) {
    console.error(err);
    showNotification("Upload failed: " + (err.message || JSON.stringify(err)), "error");
    uploadStatus.classList.add("hidden");
  }
});

function startPollingProgress(jobId) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const data = await apiFetch(`/imports/status/${jobId}/`);

      const pct = Number(data.percent ?? 0);
      const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;

      uploadProgress.style.width = safePct + "%";
      if (uploadPercent) uploadPercent.textContent = safePct + "% completed";
      uploadDetails.textContent = data.message || "";

      // ONLY stop polling when status is explicitly COMPLETED
      // Do NOT stop just because percent reaches 100
      if (typeof data.status === "string" && data.status.toUpperCase() === "COMPLETED") {
        stopPolling();
        uploadProgress.style.width = "100%";
        if (uploadPercent) uploadPercent.textContent = "100% completed";
        uploadResult.innerHTML = `<div class="text-sm text-green-700">Import completed successfully.</div>`;
        showNotification("Import completed", "success");
      }

    } catch (e) {
      console.error("progress poll error:", e);
      // Stay silent; do NOT stop polling immediately
    }
  }, 500);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  currentJob = null;
}

//
// PRODUCTS - listing, pagination, filters, CRUD
//
let productsState = { page: 1, totalPages: 1, pageSize: 20, filters: {} };

async function productsLoadPage(page = 1) {
  const sku = document.getElementById("filter-sku").value.trim();
  const name = document.getElementById("filter-name").value.trim();
  const description = document.getElementById("filter-desc").value.trim();
  const active = document.getElementById("filter-active").value;

  productsState.page = page;
  productsState.filters = { sku, name, description, active };

  let qs = `?page=${page}`;
  if (sku) qs += `&sku=${encodeURIComponent(sku)}`;
  if (name) qs += `&name=${encodeURIComponent(name)}`;
  if (description) qs += `&description=${encodeURIComponent(description)}`;
  if (active) qs += `&active=${encodeURIComponent(active)}`;

  try {
    const data = await apiFetch(`/products/${qs}`);
    // expected: { results: [..], count: N, next: ..., previous: ..., page: X, total_pages: Y } or DRF default {results, count}
    const list = data.results || data;
    renderProducts(list);
    // try to set page info
    productsState.totalPages = data.total_pages || Math.ceil((data.count || list.length) / productsState.pageSize) || 1;
    document.getElementById("page-indicator").textContent = `Page ${productsState.page} / ${productsState.totalPages}`;
    document.getElementById("products-info").textContent = `Showing ${list.length} items`;
  } catch (e) {
    console.error(e);
    showNotification("Failed to load products", "error");
  }
}

function renderProducts(items) {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML = "";
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-sm text-gray-500">No products</td></tr>`;
    return;
  }
  for (const p of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-2">${escapeHtml(p.sku)}</td>
      <td class="py-2">${escapeHtml(p.name)}</td>
      <td class="py-2">${escapeHtml(truncate(p.description || "", 120))}</td>
      <td class="py-2">${p.active ? "Yes" : "No"}</td>
      <td class="py-2">
        <button data-id="${p.id}" class="btn-edit px-2 py-1 border rounded text-sm mr-2">Edit</button>
        <button data-id="${p.id}" class="btn-delete px-2 py-1 border rounded text-sm text-red-600">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // attach listeners
  qsa(".btn-edit").forEach(b => b.addEventListener("click", ev => {
    const id = ev.currentTarget.dataset.id;
    console.log(ev.currentTarget)
    openProductModal(id);
  }));
  qsa(".btn-delete").forEach(b => b.addEventListener("click", ev => {
  const id = ev.currentTarget.dataset.id;

  openDeleteModal(
    "Are you sure you want to delete this product?",
    async () => {
      await deleteProduct(id);
    }
  );
}));
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function truncate(s, n=100) { return s.length > n ? s.slice(0,n-1) + "…" : s; }

document.getElementById("filter-apply").addEventListener("click", () => productsLoadPage(1));
document.getElementById("filter-reset").addEventListener("click", () => {
  document.getElementById("filter-sku").value = "";
  document.getElementById("filter-name").value = "";
  document.getElementById("filter-active").value = "";
  productsLoadPage(1);
});

document.getElementById("prev-page").addEventListener("click", () => {
  if (productsState.page > 1) productsLoadPage(productsState.page - 1);
});
document.getElementById("next-page").addEventListener("click", () => {
  if (productsState.page < productsState.totalPages) productsLoadPage(productsState.page + 1);
});

// New product modal
const modalBackdrop = document.getElementById("modal-backdrop");
const productForm = document.getElementById("product-form");
document.getElementById("btn-new-product").addEventListener("click", () => {
  openProductModal();
});
document.getElementById("modal-cancel").addEventListener("click", closeProductModal);

function openProductModal(id) {
  document.getElementById("product-id").value = "";
  document.getElementById("product-sku").value = "";
  document.getElementById("product-name").value = "";
  document.getElementById("product-desc").value = "";
  document.getElementById("product-active").checked = true;
  document.getElementById("modal-title").textContent = id ? "Edit Product" : "New Product";
  modalBackdrop.classList.remove("hidden");
  modalBackdrop.style.display = "flex";

  if (id) {
    // load product details
    apiFetch(`/products/${id}/`).then(data => {
      document.getElementById("product-id").value = data.id;
      document.getElementById("product-sku").value = data.sku;
      document.getElementById("product-name").value = data.name;
      document.getElementById("product-desc").value = data.description;
      document.getElementById("product-active").checked = data.active;
    }).catch(e => {
      showNotification("Failed to load product", "error");
      console.error(e);
    });
  }
}

function closeProductModal() {
  modalBackdrop.classList.add("hidden");
  modalBackdrop.style.display = "";
}

productForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = document.getElementById("product-id").value || null;
  const sku = document.getElementById("product-sku").value.trim();
  const name = document.getElementById("product-name").value.trim();
  const description = document.getElementById("product-desc").value.trim();
  const active = document.getElementById("product-active").checked;

  try {
    if (id) {
      await apiFetch(`/products/${id}/`, { method: "PATCH", body: { sku, name, description, active } });
      showNotification("Product updated", "success");
    } else {
      await apiFetch(`/products/`, { method: "POST", body: { sku, name, description, active } });
      showNotification("Product created", "success");
    }
    closeProductModal();
    productsLoadPage(productsState.page);
  } catch (e) {
    console.error(e);
    showNotification("Failed to save product: " + (e.body?.detail || JSON.stringify(e.body) || e.status), "error");
  }
});

async function deleteProduct(id) {
  try {
    await apiFetch(`/products/${id}/`, { method: "DELETE" });
    showNotification("Product deleted", "success");
    productsLoadPage(productsState.page);
  } catch (e) {
    console.error(e);
    showNotification("Failed to delete product", "error");
  }
}

// Bulk delete
document.getElementById("btn-bulk-delete").addEventListener("click", async () => {
  openDeleteModal(
  "This will delete ALL products permanently. Continue?",
  async () => {
    try {
      await apiFetch(`/products/`, { method: "DELETE" });
      showNotification("All products deleted", "success");
      productsLoadPage(1);
    } catch (e) {
      showNotification("Bulk delete failed", "error");
    }
  }
);
});

//
// WEBHOOKS
//
const webhookBackdrop = document.getElementById("webhook-backdrop");
const webhookForm = document.getElementById("webhook-form");
document.getElementById("btn-new-webhook").addEventListener("click", () => openWebhookModal(null));
document.getElementById("webhook-cancel").addEventListener("click", closeWebhookModal);

function openWebhookModal(w = null) {
  document.getElementById("webhook-id").value = "";
  document.getElementById("webhook-url").value = "";
  document.getElementById("webhook-event").value = "product.created";
  document.getElementById("webhook-enabled").checked = true;
  document.getElementById("webhook-modal-title").textContent = w ? "Edit Webhook" : "New Webhook";
  webhookBackdrop.classList.remove("hidden");
  webhookBackdrop.style.display = "flex";

  if (w) {
    document.getElementById("webhook-id").value = w.id;
    document.getElementById("webhook-url").value = w.url;
    document.getElementById("webhook-event").value = w.event;
    document.getElementById("webhook-enabled").checked = !!w.enabled;
  }
}

function closeWebhookModal() {
  webhookBackdrop.classList.add("hidden");
  webhookBackdrop.style.display = "";
}

async function loadWebhooks() {
  try {
    const list = await apiFetch(`/webhooks/`);
    renderWebhooks(list);
  } catch (e) {
    console.error(e);
    showNotification("Failed to load webhooks", "error");
  }
}

function renderWebhooks(list) {
  const wrap = document.getElementById("webhooks-list");
  wrap.innerHTML = "";
  if (!list || !list.length) return wrap.innerHTML = `<div class="text-sm text-gray-500">No webhooks configured</div>`;

  for (const w of list) {
    const div = document.createElement("div");
    div.className = "p-3 border rounded flex items-center justify-between";
    div.innerHTML = `
      <div>
        <div class="text-sm font-medium">${escapeHtml(w.url)}</div>
        <div class="text-xs text-gray-600">Event: ${w.event} • ${w.enabled ? "Enabled" : "Disabled"}</div>
      </div>
      <div class="flex gap-2 items-center">
        <button data-id="${w.id}" class="btn-test px-2 py-1 border rounded text-sm">Test</button>
        <button data-id="${w.id}" class="btn-edit-w px-2 py-1 border rounded text-sm">Edit</button>
        <button data-id="${w.id}" class="btn-delete-w px-2 py-1 border rounded text-sm text-red-600">Delete</button>
      </div>
    `;
    wrap.appendChild(div);
  }

  qsa(".btn-test").forEach(b => b.addEventListener("click", ev => {
    const id = ev.currentTarget.dataset.id;
    testWebhook(id);
  }));
  qsa(".btn-edit-w").forEach(b => b.addEventListener("click", ev => {
    const id = ev.currentTarget.dataset.id;
    apiFetch(`/webhooks/${id}/`).then(w => openWebhookModal(w)).catch(e => showNotification("Failed to load webhook", "error"));
  }));
  qsa(".btn-delete-w").forEach(b => b.addEventListener("click", async ev => {
    const id = ev.currentTarget.dataset.id;
    if (!confirm("Delete this webhook?")) return;
    try {
      await apiFetch(`/webhooks/${id}/`, { method: "DELETE" });
      showNotification("Webhook deleted", "success");
      loadWebhooks();
    } catch (e) {
      console.error(e);
      showNotification("Failed to delete webhook", "error");
    }
  }));
}

webhookForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = document.getElementById("webhook-id").value || null;
  const url = document.getElementById("webhook-url").value.trim();
  const event = document.getElementById("webhook-event").value;
  const enabled = document.getElementById("webhook-enabled").checked;

  try {
    if (id) {
      await apiFetch(`/webhooks/${id}/`, { method: "PUT", body: { url, event, enabled }});
      showNotification("Webhook updated", "success");
    } else {
      await apiFetch(`/webhooks/`, { method: "POST", body: { url, event, enabled }});
      showNotification("Webhook created", "success");
    }
    closeWebhookModal();
    loadWebhooks();
  } catch (e) {
    console.error(e);
    showNotification("Failed to save webhook", "error");
  }
});

async function testWebhook(id) {
    const notifications = document.getElementById("notifications");
  try {
    const res = await apiFetch(`/webhooks/${id}/test/`, { method: "POST" });

    if (res.status >= 200 && res.status < 300) {
      showNotification(`Webhook test passed: ${res.status}`, "success");
    } else {
      showNotification(`Webhook test failed: ${res.status}`, "error");
    }

  } catch (e) {
    console.error(e);
    showNotification("Webhook test failed: No response or network error", "error");
  }
}

//
// Small helpers
//
function serializeForm(form) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k,v] of fd.entries()) obj[k] = v;
  return obj;
}

//
// DELETE CONFIRMATION MODAL
//
const deleteBackdrop = document.getElementById("delete-confirm-backdrop");
const deleteConfirmBtn = document.getElementById("delete-confirm");
const deleteCancelBtn = document.getElementById("delete-cancel");
const deleteText = document.getElementById("delete-confirm-text");

let deleteAction = null;

function openDeleteModal(message, action) {
  deleteText.textContent = message;
  deleteAction = action;
  deleteBackdrop.classList.remove("hidden");
  deleteBackdrop.style.display = "flex";
}

function closeDeleteModal() {
  deleteBackdrop.classList.add("hidden");
  deleteBackdrop.style.display = "";
  deleteAction = null;
}

deleteCancelBtn.addEventListener("click", closeDeleteModal);

deleteConfirmBtn.addEventListener("click", async () => {
  if (deleteAction) await deleteAction();
  closeDeleteModal();
});

//
// Startup - show upload view
//
showView("view-upload");