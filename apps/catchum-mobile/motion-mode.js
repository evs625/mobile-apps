const STORAGE_KEY = "catchum-mobile-motion-mode-v1";
const select = document.querySelector("[data-motion-mode]");
const allowed = new Set(["lateral", "rotational", "both"]);

function normalize(value) {
  return allowed.has(value) ? value : "both";
}

if (select) {
  let stored = "both";
  try {
    stored = normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Local storage is optional; the control still works for this session.
  }
  select.value = stored;

  select.addEventListener("change", () => {
    const mode = normalize(select.value);
    select.value = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Keep the selected mode for the current page even if storage is blocked.
    }
    window.dispatchEvent(new CustomEvent("catchum-motion-mode", { detail: mode }));
  });
}
