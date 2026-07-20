const STORAGE_KEY = "catchum-mobile-invert-rotation-v1";
const modeRow = document.querySelector("[data-motion-mode]")?.closest("label");

function readStoredValue() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeValue(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Boolean(value)));
  } catch {
    // The setting remains active for this page when storage is blocked.
  }
}

function publish(value) {
  window.dispatchEvent(new CustomEvent("catchum-rotation-invert", { detail: Boolean(value) }));
}

if (modeRow) {
  const row = document.createElement("label");
  row.className = "switch-row";
  row.innerHTML = '<span>Invert rotational direction</span><input type="checkbox" data-invert-rotation>';
  modeRow.insertAdjacentElement("afterend", row);

  const checkbox = row.querySelector("[data-invert-rotation]");
  checkbox.checked = readStoredValue();
  checkbox.addEventListener("change", () => {
    storeValue(checkbox.checked);
    publish(checkbox.checked);
  });

  queueMicrotask(() => publish(checkbox.checked));
}
