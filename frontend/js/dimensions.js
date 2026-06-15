import { DIMENSION_ORDER, DIMENSION_LABELS } from "./config.js";

/** Barras horizontais de dimensão — substituem o radar chart. */
export function renderDimensionBars(containerId, dimensions) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";
  container.setAttribute("aria-label", "Notas por dimensão");

  DIMENSION_ORDER.forEach((key) => {
    const dim = dimensions[key];
    const score = dim.score;

    const row = document.createElement("div");
    row.className = "dim-bar-row";

    const label = document.createElement("span");
    label.className = "dim-bar-label";
    label.textContent = DIMENSION_LABELS[key];

    const trackWrap = document.createElement("div");
    trackWrap.className = "dim-bar-track";
    const fill = document.createElement("div");
    fill.className = "dim-bar-fill";
    fill.style.width = `${score}%`;
    fill.setAttribute("role", "meter");
    fill.setAttribute("aria-valuenow", String(score));
    fill.setAttribute("aria-valuemin", "0");
    fill.setAttribute("aria-valuemax", "100");
    fill.setAttribute("aria-label", `${DIMENSION_LABELS[key]}: ${score}`);
    trackWrap.appendChild(fill);

    const value = document.createElement("span");
    value.className = "dim-bar-value mono";
    value.textContent = String(score);

    row.appendChild(label);
    row.appendChild(trackWrap);
    row.appendChild(value);
    container.appendChild(row);
  });
}
