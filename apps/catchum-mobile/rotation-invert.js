const INVERT_STORAGE_KEY = "catchum-mobile-invert-rotation-v1";
const RESPONSE_STORAGE_KEY = "catchum-mobile-motion-response-v1";
const modeRow = document.querySelector("[data-motion-mode]")?.closest("label");
const sensitivityRow = document.querySelector("[data-sensitivity]")?.closest("label");
const RESPONSE_VALUES = new Set(["fast", "balanced", "stable"]);

function readStoredInvert() {
  try {
    return localStorage.getItem(INVERT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readStoredResponse() {
  try {
    const value = localStorage.getItem(RESPONSE_STORAGE_KEY);
    return RESPONSE_VALUES.has(value) ? value : "fast";
  } catch {
    return "fast";
  }
}

function storeValue(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The setting remains active for this page when storage is blocked.
  }
}

function publishInvert(value) {
  window.dispatchEvent(new CustomEvent("catchum-rotation-invert", { detail: Boolean(value) }));
}

function publishResponse(value) {
  const normalized = RESPONSE_VALUES.has(value) ? value : "fast";
  window.dispatchEvent(new CustomEvent("catchum-motion-response", { detail: normalized }));
}

if (modeRow) {
  const row = document.createElement("label");
  row.className = "switch-row";
  row.innerHTML = '<span>Invert rotational direction</span><input type="checkbox" data-invert-rotation>';
  modeRow.insertAdjacentElement("afterend", row);

  const checkbox = row.querySelector("[data-invert-rotation]");
  checkbox.checked = readStoredInvert();
  checkbox.addEventListener("change", () => {
    storeValue(INVERT_STORAGE_KEY, Boolean(checkbox.checked));
    publishInvert(checkbox.checked);
  });

  queueMicrotask(() => publishInvert(checkbox.checked));
}

if (sensitivityRow) {
  const row = document.createElement("label");
  row.className = "select-row";
  row.innerHTML = '<span>Motion response</span><select data-motion-response><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="stable">Stable</option></select>';
  sensitivityRow.insertAdjacentElement("afterend", row);

  const select = row.querySelector("[data-motion-response]");
  select.value = readStoredResponse();
  select.addEventListener("change", () => {
    const response = RESPONSE_VALUES.has(select.value) ? select.value : "fast";
    select.value = response;
    storeValue(RESPONSE_STORAGE_KEY, response);
    publishResponse(response);
  });

  queueMicrotask(() => publishResponse(select.value));
}
