import { processSketchImage } from "./modules/sketchToVector.js";
import { cleanScannedSketch } from "./modules/sketchScanner.js";
import { DEFAULT_PALLET_CANDIDATES, optimizePalletStack } from "./modules/palletOptimizer.js";

const state = {
  fileName: "",
  sourceText: "",
  entities: [],
  bounds: null,
  unsupported: [],
  rawSvg: "",
  blueprintSvg: "",
  explanationText: "",
  cutListText: "",
  cutListCsv: "",
  pendingScanCanvas: null
};

const PAGE_PRESETS = {
  letter: { widthIn: 11, heightIn: 8.5 },
  tabloid: { widthIn: 17, heightIn: 11 }
};

const BOX_COLORS = ["#1d4f8f", "#d89d26", "#2e7d5b", "#8b4fb8", "#b84a3a", "#327d9d"];

const PALLET_SAMPLE_BOXES = [
  { name: "Carton A", length: 16, width: 12, height: 10, quantity: 36 },
  { name: "Carton B", length: 20, width: 14, height: 12, quantity: 24 },
  { name: "Carton C", length: 10, width: 8, height: 8, quantity: 48 }
];

const controls = {
  dxfFile: document.getElementById("dxfFile"),
  blueprintMenu: document.getElementById("blueprintMenu"),
  blueprintMenuToggle: document.getElementById("blueprintMenuToggle"),
  blueprintMenuClose: document.getElementById("blueprintMenuClose"),
  dropInput: document.getElementById("dxfDropInput"),
  btnImportSketch: document.getElementById("btnImportSketch"),
  btnScanSketch: document.getElementById("btnScanSketch"),
  sketchUpload: document.getElementById("sketchUpload"),
  sketchCameraCapture: document.getElementById("sketchCameraCapture"),
  dropZone: document.getElementById("dropZone"),
  dropLabel: document.getElementById("dropLabel"),
  createTemplateBtn: document.getElementById("createTemplateBtn"),
  templatePanel: document.getElementById("templatePanel"),
  templateType: document.getElementById("templateType"),
  templateFields: document.getElementById("templateFields"),
  applyTemplateBtn: document.getElementById("applyTemplateBtn"),
  explainBtn: document.getElementById("explainBtn"),
  cutListBtn: document.getElementById("cutListBtn"),
  explainPanel: document.getElementById("explainPanel"),
  explainText: document.getElementById("explainText"),
  cutListPanel: document.getElementById("cutListPanel"),
  cutListText: document.getElementById("cutListText"),
  downloadCutCsvBtn: document.getElementById("downloadCutCsvBtn"),
  downloadCutTxtBtn: document.getElementById("downloadCutTxtBtn"),
  messageBanner: document.getElementById("messageBanner"),
  unsupportedPanel: document.getElementById("unsupportedPanel"),
  unsupportedList: document.getElementById("unsupportedList"),
  drawingTitle: document.getElementById("drawingTitle"),
  projectName: document.getElementById("projectName"),
  actualWidth: document.getElementById("actualWidth"),
  actualHeight: document.getElementById("actualHeight"),
  units: document.getElementById("units"),
  pagePreset: document.getElementById("pagePreset"),
  orientation: document.getElementById("orientation"),
  revision: document.getElementById("revision"),
  notes: document.getElementById("notes"),
  generateBtn: document.getElementById("generateBtn"),
  exportBtn: document.getElementById("exportBtn"),
  printBtn: document.getElementById("printBtn"),
  resetBtn: document.getElementById("resetBtn"),
  loadSampleBtn: document.getElementById("loadSampleBtn"),
  rawPreview: document.getElementById("rawPreview"),
  blueprintPreview: document.getElementById("blueprintPreview"),
  fileMeta: document.getElementById("fileMeta"),
  processingModal: document.getElementById("processingModal"),
  processingStatus: document.getElementById("processingStatus"),
  scanPreviewModal: document.getElementById("scanPreviewModal"),
  scanPreviewImage: document.getElementById("scanPreviewImage"),
  scanPreviewClose: document.getElementById("scanPreviewClose"),
  useScanBtn: document.getElementById("useScanBtn"),
  retakeScanBtn: document.getElementById("retakeScanBtn"),
  cancelScanBtn: document.getElementById("cancelScanBtn"),
  boxRows: document.getElementById("boxRows"),
  addBoxRowBtn: document.getElementById("addBoxRowBtn"),
  loadPalletSampleBtn: document.getElementById("loadPalletSampleBtn"),
  clearPalletBtn: document.getElementById("clearPalletBtn"),
  optimizePalletBtn: document.getElementById("optimizePalletBtn"),
  palletUnit: document.getElementById("palletUnit"),
  maxStackHeight: document.getElementById("maxStackHeight"),
  customPalletName: document.getElementById("customPalletName"),
  customPalletLength: document.getElementById("customPalletLength"),
  customPalletWidth: document.getElementById("customPalletWidth"),
  palletAnimation: document.getElementById("palletAnimation"),
  palletSummary: document.getElementById("palletSummary"),
  palletFiller: document.getElementById("palletFiller"),
  palletPlan: document.getElementById("palletPlan"),
  palletPatterns: document.getElementById("palletPatterns")
};

function setMessage(text, isError) {
  controls.messageBanner.textContent = text;
  controls.messageBanner.classList.toggle("error", Boolean(isError));
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value, digits = 2) {
  return Number(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function truncateText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) {
    return text;
  }
  if (maxChars < 6) {
    return text.slice(0, maxChars);
  }
  const head = Math.ceil((maxChars - 1) / 2);
  const tail = Math.floor((maxChars - 1) / 2);
  return `${text.slice(0, head)}\u2026${text.slice(text.length - tail)}`;
}

function todayStamp() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return `${yyyy}-${mm}-${dd}`;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function mapPageSize() {
  const presetValue = controls.pagePreset.value;
  const [sheet, presetOrientation] = presetValue.split("-");
  const orientation = controls.orientation.value || presetOrientation || "landscape";
  const base = PAGE_PRESETS[sheet] || PAGE_PRESETS.letter;

  const widthIn = orientation === "portrait" ? Math.min(base.widthIn, base.heightIn) : Math.max(base.widthIn, base.heightIn);
  const heightIn = orientation === "portrait" ? Math.max(base.widthIn, base.heightIn) : Math.min(base.widthIn, base.heightIn);

  return {
    widthIn,
    heightIn,
    name: `${sheet === "tabloid" ? "Tabloid" : "Letter"} ${orientation}`
  };
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return formatNumber(number, number >= 10 ? 1 : 2);
}

function parsePositiveNumber(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function dimensionFromInches(value, unit) {
  if (unit === "ft") return value / 12;
  if (unit === "mm") return value * 25.4;
  return value;
}

function defaultStackHeightForUnit(unit) {
  return dimensionFromInches(60, unit);
}

function setBlueprintMenu(open) {
  if (!controls.blueprintMenu) return;
  controls.blueprintMenu.hidden = !open;
  controls.blueprintMenuToggle?.setAttribute("aria-expanded", String(Boolean(open)));
}

function toggleBlueprintMenu() {
  setBlueprintMenu(Boolean(controls.blueprintMenu?.hidden));
}

function setPalletStatus(message, isError = false) {
  if (!controls.palletSummary) return;
  controls.palletSummary.classList.toggle("error", Boolean(isError));
  controls.palletSummary.innerHTML = message;
}

function rowValue(row, selector) {
  return row.querySelector(selector)?.value?.trim() || "";
}

function renumberBoxRows() {
  if (!controls.boxRows) return;
  [...controls.boxRows.querySelectorAll("tr")].forEach((row, index) => {
    const nameInput = row.querySelector(".box-name");
    if (nameInput) {
      nameInput.placeholder = `Box ${index + 1}`;
    }
  });
}

function addBoxRow(values = {}) {
  if (!controls.boxRows) return;

  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input class="box-name" type="text" placeholder="Box ${controls.boxRows.children.length + 1}" value="${escapeXml(values.name || "")}" /></td>
    <td><input class="box-length" type="number" min="0" step="0.001" value="${values.length || ""}" /></td>
    <td><input class="box-width" type="number" min="0" step="0.001" value="${values.width || ""}" /></td>
    <td><input class="box-height" type="number" min="0" step="0.001" value="${values.height || ""}" /></td>
    <td><input class="box-quantity" type="number" min="1" step="1" value="${values.quantity || ""}" /></td>
    <td><button class="btn btn-ghost btn-small remove-box-row" type="button">Remove</button></td>
  `;

  row.querySelector(".remove-box-row")?.addEventListener("click", () => {
    row.remove();
    if (!controls.boxRows.children.length) {
      addBoxRow();
    }
    renumberBoxRows();
  });

  controls.boxRows.appendChild(row);
}

function clearPalletPlanner() {
  if (controls.boxRows) {
    controls.boxRows.innerHTML = "";
    addBoxRow();
  }
  if (controls.customPalletName) controls.customPalletName.value = "";
  if (controls.customPalletLength) controls.customPalletLength.value = "";
  if (controls.customPalletWidth) controls.customPalletWidth.value = "";
  if (controls.palletUnit) controls.palletUnit.value = "in";
  if (controls.maxStackHeight) controls.maxStackHeight.value = formatDimension(defaultStackHeightForUnit("in"));
  if (controls.palletAnimation) {
    controls.palletAnimation.classList.add("empty");
    controls.palletAnimation.innerHTML = "";
  }
  if (controls.palletPlan) controls.palletPlan.innerHTML = "";
  if (controls.palletPatterns) controls.palletPatterns.innerHTML = "";
  if (controls.palletFiller) {
    controls.palletFiller.hidden = true;
    controls.palletFiller.innerHTML = "";
  }
  setPalletStatus("No stack plan yet.", false);
}

function loadPalletSample() {
  if (!controls.boxRows) return;
  controls.boxRows.innerHTML = "";
  PALLET_SAMPLE_BOXES.forEach((box) => addBoxRow(box));
  if (controls.palletUnit) controls.palletUnit.value = "in";
  if (controls.maxStackHeight) controls.maxStackHeight.value = formatDimension(defaultStackHeightForUnit("in"));
  handleOptimizePallet();
}

function collectPalletBoxes() {
  const rows = controls.boxRows ? [...controls.boxRows.querySelectorAll("tr")] : [];
  const boxes = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rawLength = rowValue(row, ".box-length");
    const rawWidth = rowValue(row, ".box-width");
    const rawHeight = rowValue(row, ".box-height");
    const rawQuantity = rowValue(row, ".box-quantity");
    const hasAnyValue = [rowValue(row, ".box-name"), rawLength, rawWidth, rawHeight, rawQuantity].some(Boolean);

    if (!hasAnyValue) {
      return;
    }

    const length = parsePositiveNumber(rawLength);
    const width = parsePositiveNumber(rawWidth);
    const height = parsePositiveNumber(rawHeight);
    const quantity = parsePositiveInteger(rawQuantity);

    if (!length || !width || !height || !quantity) {
      errors.push(`Box ${index + 1} needs length, width, height, and quantity.`);
      return;
    }

    boxes.push({
      id: `box-${index + 1}`,
      name: rowValue(row, ".box-name") || `Box ${index + 1}`,
      length,
      width,
      height,
      quantity
    });
  });

  if (!boxes.length && !errors.length) {
    errors.push("Add at least one box size and quantity.");
  }

  return { boxes, errors };
}

function collectPalletCandidates() {
  const unit = controls.palletUnit?.value || "in";
  const pallets = DEFAULT_PALLET_CANDIDATES.map((pallet) => ({
    ...pallet,
    length: dimensionFromInches(pallet.length, unit),
    width: dimensionFromInches(pallet.width, unit)
  }));
  const customLength = parsePositiveNumber(controls.customPalletLength?.value);
  const customWidth = parsePositiveNumber(controls.customPalletWidth?.value);
  const customName = controls.customPalletName?.value?.trim() || "Custom";
  const errors = [];

  if (customLength || customWidth) {
    if (!customLength || !customWidth) {
      errors.push("Custom pallet needs both length and width.");
    } else {
      pallets.push({
        id: "custom",
        name: customName,
        length: customLength,
        width: customWidth
      });
    }
  }

  return { pallets, errors };
}

function colorForBox(boxId) {
  const number = Number.parseInt(String(boxId).replace(/\D/g, ""), 10);
  const index = Number.isFinite(number) && number > 0 ? number - 1 : 0;
  return BOX_COLORS[index % BOX_COLORS.length];
}

function renderFootprintSvg(boxPlan) {
  const { pallet, pattern, box } = boxPlan;
  const color = colorForBox(box.id);
  const rects = [];
  let drawn = 0;

  pattern.zones.forEach((zone) => {
    for (let row = 0; row < zone.rows; row += 1) {
      for (let column = 0; column < zone.columns; column += 1) {
        if (drawn > 220) return;
        const x = zone.x + column * zone.boxLength;
        const y = zone.y + row * zone.boxWidth;
        rects.push(`<rect x="${x}" y="${y}" width="${zone.boxLength}" height="${zone.boxWidth}" rx="0.75" fill="${color}" fill-opacity="0.72" stroke="#ffffff" stroke-width="0.45" />`);
        drawn += 1;
      }
    }
  });

  return `<svg class="footprint-svg" viewBox="0 0 ${pallet.length} ${pallet.width}" role="img" aria-label="${escapeXml(box.name)} pallet footprint">
    <rect x="0" y="0" width="${pallet.length}" height="${pallet.width}" rx="1.5" fill="#f8fbff" stroke="#8293a8" stroke-width="0.8" />
    ${rects.join("")}
  </svg>`;
}

function renderStackSvg(palletStack, maxStackHeight) {
  const chartHeight = 180;
  const chartWidth = 96;
  let y = chartHeight;
  const layers = palletStack.layers.map((layer) => {
    const height = Math.max(2, (layer.height / maxStackHeight) * chartHeight);
    y -= height;
    return `<rect x="18" y="${Math.max(0, y)}" width="60" height="${height}" fill="${colorForBox(layer.boxId)}" fill-opacity="0.8" stroke="#ffffff" stroke-width="1">
      <title>${escapeXml(layer.boxName)}: ${layer.count} boxes, ${formatDimension(layer.height)} high</title>
    </rect>`;
  });

  return `<svg class="stack-svg" viewBox="0 0 ${chartWidth} ${chartHeight + 22}" role="img" aria-label="Pallet ${palletStack.id} stack">
    <rect x="18" y="0" width="60" height="${chartHeight}" rx="2" fill="#eef3f8" stroke="#9dadc0" stroke-width="1" />
    ${layers.join("")}
    <rect x="10" y="${chartHeight}" width="76" height="10" rx="1.5" fill="#9b7650" />
  </svg>`;
}

function formatVolume(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return `0 ${unit}^3`;
  if (number >= 1000) return `${formatNumber(number / 1000, 1)}k ${unit}^3`;
  return `${formatNumber(number, 0)} ${unit}^3`;
}

function renderAnimatedPallet(best, unit) {
  if (!controls.palletAnimation) return;

  const palletStack = best.pallets[0];
  if (!palletStack) {
    controls.palletAnimation.classList.add("empty");
    controls.palletAnimation.innerHTML = "";
    return;
  }

  const visibleLayers = palletStack.layers.slice(0, 10);
  const maxVisualHeight = 150;
  let bottom = 0;
  const layers = visibleLayers.map((layer, index) => {
    const visualHeight = Math.max(12, Math.min(34, (layer.height / best.maxStackHeight) * maxVisualHeight));
    const fill = Math.max(0.46, Math.min(1, layer.footprintUtilization || 0.65));
    const width = 54 + fill * 34;
    const depth = 28 + fill * 16;
    const html = `
      <div class="animated-layer" style="--layer-bottom:${bottom}px; --layer-height:${visualHeight}px; --layer-width:${width}%; --layer-depth:${depth}px; --layer-color:${colorForBox(layer.boxId)}; --layer-delay:${index * 0.38}s;">
        <span>${escapeXml(layer.boxName)}</span>
      </div>
    `;
    bottom += visualHeight + 2;
    return html;
  }).join("");

  controls.palletAnimation.classList.remove("empty");
  controls.palletAnimation.innerHTML = `
    <div class="pallet-animation-head">
      <div>
        <h3>Animated Pallet Build</h3>
        <p>${escapeXml(best.pallet.name)} | Pallet 1 of ${best.pallets.length} | ${formatDimension(palletStack.usedHeight)} ${escapeXml(unit)} stacked</p>
      </div>
      <span>${visibleLayers.length}${palletStack.layers.length > visibleLayers.length ? "+" : ""} layers</span>
    </div>
    <div class="pallet-stage" aria-label="Animated pallet stack preview">
      <div class="pallet-base">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="pallet-runner runner-left"></div>
      <div class="pallet-runner runner-mid"></div>
      <div class="pallet-runner runner-right"></div>
      <div class="animated-stack">${layers}</div>
    </div>
  `;
}

function getFillerRecommendations(best, unit) {
  const palletArea = best.pallet.length * best.pallet.width;
  const allLayers = best.pallets.flatMap((palletStack) => palletStack.layers);
  const partialLayers = allLayers.filter((layer) => layer.count < layer.capacity);
  const distinctBoxes = new Set(allLayers.map((layer) => layer.boxId)).size;
  const mixedLayerHeights = new Set(allLayers.map((layer) => formatDimension(layer.height))).size;
  const voidVolume = allLayers.reduce((total, layer) => {
    const emptyArea = Math.max(0, palletArea * (1 - (layer.footprintUtilization || 0)));
    return total + emptyArea * layer.height;
  }, 0);
  const recommendations = [];

  if (partialLayers.length || best.averageFootprintUtilization < 0.82) {
    recommendations.push({
      title: "Void Fill",
      material: "Air pillows, kraft paper, or bubble wrap",
      amount: formatVolume(voidVolume, unit),
      reason: `${partialLayers.length || "Some"} partial layer${partialLayers.length === 1 ? "" : "s"} leave open pockets around the cartons.`
    });
  }

  if (distinctBoxes > 1 || mixedLayerHeights > 1) {
    recommendations.push({
      title: "Layer Separation",
      material: "Corrugated slip sheets or thin foam sheets",
      amount: `${allLayers.length} layer sheet${allLayers.length === 1 ? "" : "s"}`,
      reason: "Mixed carton sizes create height transitions, so sheets help bridge gaps and keep pressure even."
    });
  }

  if (best.maxHeightUsed >= best.maxStackHeight * 0.7 || best.pallets.length > 1) {
    recommendations.push({
      title: "Load Stabilizing",
      material: "Stretch wrap plus corner boards",
      amount: `${best.pallets.length} pallet set${best.pallets.length === 1 ? "" : "s"}`,
      reason: "The stack is tall enough that side support will matter during movement."
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      title: "Light Protection",
      material: "Stretch wrap only",
      amount: `${best.pallets.length} pallet wrap${best.pallets.length === 1 ? "" : "s"}`,
      reason: "The footprint is tight, with little void space to fill."
    });
  }

  return recommendations;
}

function renderFillerRecommendations(best, unit) {
  if (!controls.palletFiller) return;
  const items = getFillerRecommendations(best, unit)
    .map((item) => `
      <article class="filler-item">
        <div>
          <h3>${escapeXml(item.title)}</h3>
          <strong>${escapeXml(item.material)}</strong>
        </div>
        <p>${escapeXml(item.amount)}</p>
        <span>${escapeXml(item.reason)}</span>
      </article>
    `).join("");

  controls.palletFiller.hidden = false;
  controls.palletFiller.innerHTML = `
    <div class="filler-head">
      <p class="kicker">Packing Material</p>
      <h2>Filler Needed</h2>
    </div>
    <div class="filler-grid">${items}</div>
  `;
}

function renderPalletStackCard(palletStack, maxStackHeight, unit) {
  const layerRows = palletStack.layers.map((layer, index) => `
    <li>
      <span class="box-swatch" style="background:${colorForBox(layer.boxId)}"></span>
      <span>${index + 1}. ${escapeXml(layer.boxName)}: ${layer.count}/${layer.capacity} boxes, ${formatDimension(layer.height)} ${escapeXml(unit)} high</span>
    </li>
  `).join("");

  return `
    <article class="pallet-stack-card">
      <div class="stack-visual">${renderStackSvg(palletStack, maxStackHeight)}</div>
      <div class="stack-details">
        <h3>Pallet ${palletStack.id}</h3>
        <p>${formatDimension(palletStack.usedHeight)} ${escapeXml(unit)} used of ${formatDimension(maxStackHeight)} ${escapeXml(unit)}</p>
        <ol class="stack-layer-list">${layerRows}</ol>
      </div>
    </article>
  `;
}

function renderPatternCard(boxPlan, unit) {
  const { box, pattern, layersNeeded } = boxPlan;
  return `
    <article class="pattern-card">
      <div class="pattern-head">
        <span class="box-swatch" style="background:${colorForBox(box.id)}"></span>
        <h3>${escapeXml(box.name)}</h3>
      </div>
      ${renderFootprintSvg(boxPlan)}
      <p>${pattern.boxesPerLayer} per layer, ${layersNeeded} layer${layersNeeded === 1 ? "" : "s"}, ${formatPercent(pattern.utilization)} footprint fill</p>
      <p>${formatDimension(box.length)} x ${formatDimension(box.width)} x ${formatDimension(box.height)} ${escapeXml(unit)}, qty ${box.quantity}</p>
    </article>
  `;
}

function renderPalletResults(result) {
  const best = result.best;
  const unit = controls.palletUnit?.value || "in";
  const rankingRows = result.plans.slice(0, 5).map((plan, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeXml(plan.pallet.name)}</td>
      <td>${formatDimension(plan.pallet.length)} x ${formatDimension(plan.pallet.width)}</td>
      <td>${plan.pallets.length}</td>
      <td>${formatPercent(plan.averageFootprintUtilization)}</td>
    </tr>
  `).join("");

  setPalletStatus(`
    <div class="pallet-summary-main">
      <strong>Best: ${escapeXml(best.pallet.name)} (${formatDimension(best.pallet.length)} x ${formatDimension(best.pallet.width)} ${escapeXml(unit)})</strong>
      <span>${best.pallets.length} pallet${best.pallets.length === 1 ? "" : "s"} for ${best.totalBoxes} boxes. Tallest stack: ${formatDimension(best.maxHeightUsed)} ${escapeXml(unit)}.</span>
    </div>
    <table class="rank-table">
      <thead><tr><th>#</th><th>Pallet</th><th>Size</th><th>Count</th><th>Fill</th></tr></thead>
      <tbody>${rankingRows}</tbody>
    </table>
  `, false);

  renderAnimatedPallet(best, unit);
  renderFillerRecommendations(best, unit);

  if (controls.palletPlan) {
    controls.palletPlan.innerHTML = best.pallets
      .map((palletStack) => renderPalletStackCard(palletStack, best.maxStackHeight, unit))
      .join("");
  }

  if (controls.palletPatterns) {
    controls.palletPatterns.innerHTML = best.boxPlans
      .map((boxPlan) => renderPatternCard(boxPlan, unit))
      .join("");
  }
}

function handleOptimizePallet() {
  const { boxes, errors: boxErrors } = collectPalletBoxes();
  const { pallets, errors: palletErrors } = collectPalletCandidates();
  const maxStackHeight = parsePositiveNumber(controls.maxStackHeight?.value) || 60;
  const errors = [...boxErrors, ...palletErrors];

  if (errors.length) {
    setPalletStatus(errors.map((error) => `<div>${escapeXml(error)}</div>`).join(""), true);
    if (controls.palletAnimation) {
      controls.palletAnimation.classList.add("empty");
      controls.palletAnimation.innerHTML = "";
    }
    if (controls.palletFiller) {
      controls.palletFiller.hidden = true;
      controls.palletFiller.innerHTML = "";
    }
    if (controls.palletPlan) controls.palletPlan.innerHTML = "";
    if (controls.palletPatterns) controls.palletPatterns.innerHTML = "";
    return;
  }

  const result = optimizePalletStack(boxes, { pallets, maxStackHeight });
  if (!result.best) {
    setPalletStatus(result.errors.map((error) => `<div>${escapeXml(error)}</div>`).join(""), true);
    if (controls.palletAnimation) {
      controls.palletAnimation.classList.add("empty");
      controls.palletAnimation.innerHTML = "";
    }
    if (controls.palletFiller) {
      controls.palletFiller.hidden = true;
      controls.palletFiller.innerHTML = "";
    }
    if (controls.palletPlan) controls.palletPlan.innerHTML = "";
    if (controls.palletPatterns) controls.palletPatterns.innerHTML = "";
    return;
  }

  renderPalletResults(result);
}

function syncPalletUnitDefaults() {
  if (!controls.maxStackHeight || !controls.palletUnit) return;
  controls.maxStackHeight.value = formatDimension(defaultStackHeightForUnit(controls.palletUnit.value));
}

function initPalletPlanner() {
  if (!controls.boxRows) return;
  controls.boxRows.innerHTML = "";
  addBoxRow();
  syncPalletUnitDefaults();
  setPalletStatus("No stack plan yet.", false);
}

function renderUnsupported(unsupported) {
  if (!unsupported.length) {
    controls.unsupportedPanel.hidden = true;
    controls.unsupportedList.innerHTML = "";
    return;
  }

  controls.unsupportedPanel.hidden = false;
  controls.unsupportedList.innerHTML = unsupported
    .map((item) => `<li>${escapeXml(item.type)} (${item.count})</li>`)
    .join("");
}

function renderSourceSvg(entities, bounds) {
  const width = 900;
  const height = 640;
  const margin = 40;
  const drawWidth = width - margin * 2;
  const drawHeight = height - margin * 2;

  const sourceWidth = Math.max(0.0001, bounds.maxX - bounds.minX);
  const sourceHeight = Math.max(0.0001, bounds.maxY - bounds.minY);
  const scale = Math.min(drawWidth / sourceWidth, drawHeight / sourceHeight);
  const offsetX = margin + (drawWidth - sourceWidth * scale) / 2;
  const offsetY = margin + (drawHeight - sourceHeight * scale) / 2;

  const tx = (x) => offsetX + (x - bounds.minX) * scale;
  const ty = (y) => height - (offsetY + (y - bounds.minY) * scale);

  const lines = entities.map((entity) => entityToSvg(entity, tx, ty, scale, "#0f2d4f", 1.4)).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff" />
    <rect x="${margin}" y="${margin}" width="${drawWidth}" height="${drawHeight}" fill="#fcfdff" stroke="#bdc9d8" stroke-width="1.2" />
    ${lines}
  </svg>`;
}

function entityToSvg(entity, tx, ty, scale, stroke, strokeWidth) {
  if (entity.type === "LINE") {
    return `<line x1="${tx(entity.x1)}" y1="${ty(entity.y1)}" x2="${tx(entity.x2)}" y2="${ty(entity.y2)}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  if (entity.type === "POLYLINE") {
    const points = entity.points.map((point) => `${tx(point.x)},${ty(point.y)}`).join(" ");
    let svg = `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    if (entity.closed && entity.points.length > 2) {
      const start = entity.points[0];
      const end = entity.points[entity.points.length - 1];
      svg += `<line x1="${tx(end.x)}" y1="${ty(end.y)}" x2="${tx(start.x)}" y2="${ty(start.y)}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
    return svg;
  }

  if (entity.type === "CIRCLE") {
    return `<circle cx="${tx(entity.cx)}" cy="${ty(entity.cy)}" r="${entity.r * scale}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  if (entity.type === "ARC") {
    const startX = tx(entity.cx + Math.cos(toRadians(entity.startAngle)) * entity.r);
    const startY = ty(entity.cy + Math.sin(toRadians(entity.startAngle)) * entity.r);
    const endX = tx(entity.cx + Math.cos(toRadians(entity.endAngle)) * entity.r);
    const endY = ty(entity.cy + Math.sin(toRadians(entity.endAngle)) * entity.r);

    let delta = entity.endAngle - entity.startAngle;
    while (delta < 0) delta += 360;
    const largeArc = delta > 180 ? 1 : 0;

    return `<path d="M ${startX} ${startY} A ${entity.r * scale} ${entity.r * scale} 0 ${largeArc} 1 ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  return "";
}

function parseUpload(text, fileName) {
  try {
    const parsed = window.DxfParserLite.parseDXF(text);
    if (!parsed.entities.length || !parsed.bounds) {
      throw new Error("No supported geometry found. Supported: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC.");
    }

    ingestGeometry(parsed.entities, fileName, parsed.unsupported);
    state.sourceText = text;
    setMessage("DXF loaded. Enter actual dimensions and click Generate Blueprint.", false);
  } catch (error) {
    console.error(error);
    setMessage(`Invalid DXF: ${error.message}`, true);
  }
}

function loadDXF(dxfText, sourceName) {
  parseUpload(String(dxfText || ""), sourceName || "sketch-import.dxf");
}

function readFile(file) {
  if (!file) {
    setMessage("No file selected. Upload a DXF file to continue.", true);
    return;
  }

  if (!/\.dxf$/i.test(file.name)) {
    setMessage("Only .dxf files are supported for this MVP.", true);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => parseUpload(String(reader.result || ""), file.name);
  reader.onerror = () => setMessage("Could not read file. Try another DXF.", true);
  reader.readAsText(file);
}

function setProcessingState(isOpen, statusText) {
  if (!controls.processingModal || !controls.processingStatus) {
    return;
  }
  controls.processingModal.hidden = !isOpen;
  controls.processingStatus.textContent = statusText || "Preparing image...";
}

function setProcessingStatus(statusText) {
  if (!controls.processingStatus) return;
  controls.processingStatus.textContent = statusText;
}

function canvasToBlob(canvas, type = "image/png", quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create image blob."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function runSketchToDxfPipeline(source, sourceName) {
  setProcessingState(true, "Tracing Lines...");
  setProcessingStatus("Generating DXF...");
  const dxf = await processSketchImage(source);
  loadDXF(dxf, sourceName || "sketch-import.dxf");
  setMessage("Sketch converted to DXF and loaded. Enter dimensions and generate blueprint.", false);
}

async function handleSketchUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    return;
  }

  if (!/^image\/(png|jpeg)$/i.test(file.type)) {
    setMessage("Sketch import supports PNG and JPEG files.", true);
    event.target.value = "";
    return;
  }

  try {
    setProcessingState(true, "Processing Sketch...");
    await runSketchToDxfPipeline(file, `${file.name.replace(/\.[^.]+$/, "")}-sketch.dxf`);
  } catch (error) {
    console.error(error);
    setMessage(`Sketch import failed: ${error.message}`, true);
  } finally {
    setProcessingState(false);
    event.target.value = "";
  }
}

function closeScanPreview() {
  state.pendingScanCanvas = null;
  if (controls.scanPreviewImage) {
    controls.scanPreviewImage.src = "";
  }
  if (controls.scanPreviewModal) {
    controls.scanPreviewModal.hidden = true;
  }
}

function showScanPreview(canvas) {
  state.pendingScanCanvas = canvas;
  controls.scanPreviewImage.src = canvas.toDataURL("image/png");
  controls.scanPreviewModal.hidden = false;
}

async function handleSketchCameraCapture(event) {
  const file = event?.target?.files?.[0];
  if (!file) {
    return;
  }

  try {
    setProcessingState(true, "Scanning Sketch...");
    setProcessingStatus("Cleaning Image...");
    const cleanedCanvas = await cleanScannedSketch(file);
    setProcessingState(false);
    showScanPreview(cleanedCanvas);
  } catch (error) {
    console.error(error);
    setProcessingState(false);
    setMessage(`Scan failed: ${error.message}. Falling back to file upload.`, true);
    if (controls.sketchUpload) {
      controls.sketchUpload.click();
    }
  } finally {
    event.target.value = "";
  }
}

async function confirmUseScan() {
  if (!(state.pendingScanCanvas instanceof HTMLCanvasElement)) {
    closeScanPreview();
    return;
  }

  try {
    controls.scanPreviewModal.hidden = true;
    setProcessingState(true, "Tracing Lines...");
    const cleanedBlob = await canvasToBlob(state.pendingScanCanvas);
    await runSketchToDxfPipeline(cleanedBlob, "camera-scan-sketch.dxf");
  } catch (error) {
    console.error(error);
    setMessage(`Could not import scan: ${error.message}`, true);
  } finally {
    setProcessingState(false);
    closeScanPreview();
  }
}

function computeBoundsFromEntities(entities) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function include(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  entities.forEach((entity) => {
    if (entity.type === "LINE") {
      include(entity.x1, entity.y1);
      include(entity.x2, entity.y2);
      return;
    }
    if (entity.type === "POLYLINE" && Array.isArray(entity.points)) {
      entity.points.forEach((p) => include(p.x, p.y));
      return;
    }
    if (entity.type === "CIRCLE") {
      include(entity.cx - entity.r, entity.cy - entity.r);
      include(entity.cx + entity.r, entity.cy + entity.r);
      return;
    }
    if (entity.type === "ARC") {
      include(entity.cx - entity.r, entity.cy - entity.r);
      include(entity.cx + entity.r, entity.cy + entity.r);
    }
  });

  if (!Number.isFinite(minX)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function ingestGeometry(entities, sourceName, unsupported) {
  const bounds = computeBoundsFromEntities(entities);
  if (!bounds) {
    throw new Error("No supported geometry generated.");
  }

  state.fileName = sourceName;
  state.sourceText = "";
  state.entities = entities;
  state.bounds = bounds;
  state.unsupported = unsupported || [];
  state.rawSvg = renderSourceSvg(entities, bounds);

  controls.rawPreview.classList.remove("empty");
  controls.rawPreview.innerHTML = state.rawSvg;

  const rawWidth = bounds.maxX - bounds.minX;
  const rawHeight = bounds.maxY - bounds.minY;
  controls.fileMeta.textContent = `${sourceName} | ${entities.length} supported entities | Source bounds ${formatNumber(rawWidth)} x ${formatNumber(rawHeight)}`;
  controls.dropLabel.textContent = `Loaded: ${sourceName}`;
  renderUnsupported(state.unsupported);
}

function templateFieldInput(id, label, value, step) {
  return `<label>${label}<input type=\"number\" id=\"${id}\" step=\"${step || "0.01"}\" value=\"${value}\" min=\"0\" /></label>`;
}

function renderTemplateFields() {
  const type = controls.templateType.value;
  if (type === "doghouse") {
    controls.templateFields.innerHTML = [
      templateFieldInput("tplWidth", "Width", "72"),
      templateFieldInput("tplWallHeight", "Wall Height", "48"),
      templateFieldInput("tplRoofPeakHeight", "Roof Peak Height", "18"),
      templateFieldInput("tplDoorWidth", "Door Width", "24"),
      templateFieldInput("tplDoorHeight", "Door Height", "36")
    ].join("");
    return;
  }

  controls.templateFields.innerHTML = [
    templateFieldInput("tplWidth", "Width", "36"),
    templateFieldInput("tplHeight", "Height", "24"),
    templateFieldInput("tplHoleDiameter", "Hole Diameter", "1"),
    templateFieldInput("tplHoleOffset", "Hole Offset", "4"),
    templateFieldInput("tplHoleCount", "Hole Count", "2", "1")
  ].join("");
}

function createRectPanelTemplateGeometry(inputs) {
  const width = Math.max(0.01, inputs.width);
  const height = Math.max(0.01, inputs.height);
  const entities = [
    { type: "LINE", x1: 0, y1: 0, x2: width, y2: 0 },
    { type: "LINE", x1: width, y1: 0, x2: width, y2: height },
    { type: "LINE", x1: width, y1: height, x2: 0, y2: height },
    { type: "LINE", x1: 0, y1: height, x2: 0, y2: 0 }
  ];

  const holeCount = Math.max(0, Math.floor(inputs.holeCount));
  const holeOffset = Math.max(0, inputs.holeOffset);
  const holeRadius = Math.max(0, inputs.holeDiameter / 2);
  if (holeCount > 0 && holeRadius > 0 && width > holeOffset * 2) {
    const y = Math.max(holeOffset, Math.min(height - holeOffset, height - holeOffset));
    for (let i = 0; i < holeCount; i += 1) {
      const t = holeCount === 1 ? 0.5 : i / (holeCount - 1);
      const x = holeOffset + t * (width - holeOffset * 2);
      entities.push({ type: "CIRCLE", cx: x, cy: y, r: holeRadius });
    }
  }

  return { entities, width, height, title: "Template Rectangular Panel" };
}

function createDoghouseTemplateGeometry(inputs) {
  const width = Math.max(0.01, inputs.width);
  const wallHeight = Math.max(0.01, inputs.wallHeight);
  const roofPeakHeight = Math.max(0.01, inputs.roofPeakHeight);
  const doorWidth = Math.max(0.01, Math.min(inputs.doorWidth, width * 0.95));
  const doorHeight = Math.max(0.01, Math.min(inputs.doorHeight, wallHeight * 0.95));
  const peakY = wallHeight + roofPeakHeight;
  const half = width / 2;
  const doorLeft = (width - doorWidth) / 2;
  const doorRight = doorLeft + doorWidth;

  const entities = [
    { type: "LINE", x1: 0, y1: 0, x2: width, y2: 0 },
    { type: "LINE", x1: width, y1: 0, x2: width, y2: wallHeight },
    { type: "LINE", x1: width, y1: wallHeight, x2: half, y2: peakY },
    { type: "LINE", x1: half, y1: peakY, x2: 0, y2: wallHeight },
    { type: "LINE", x1: 0, y1: wallHeight, x2: 0, y2: 0 },
    { type: "LINE", x1: doorLeft, y1: 0, x2: doorLeft, y2: doorHeight },
    { type: "LINE", x1: doorLeft, y1: doorHeight, x2: doorRight, y2: doorHeight },
    { type: "LINE", x1: doorRight, y1: doorHeight, x2: doorRight, y2: 0 }
  ];

  return { entities, width, height: peakY, title: "Template Doghouse Front" };
}

function applyTemplate() {
  try {
    const type = controls.templateType.value;
    let result;

    if (type === "doghouse") {
      result = createDoghouseTemplateGeometry({
        width: parseFloat(document.getElementById("tplWidth")?.value),
        wallHeight: parseFloat(document.getElementById("tplWallHeight")?.value),
        roofPeakHeight: parseFloat(document.getElementById("tplRoofPeakHeight")?.value),
        doorWidth: parseFloat(document.getElementById("tplDoorWidth")?.value),
        doorHeight: parseFloat(document.getElementById("tplDoorHeight")?.value)
      });
    } else {
      result = createRectPanelTemplateGeometry({
        width: parseFloat(document.getElementById("tplWidth")?.value),
        height: parseFloat(document.getElementById("tplHeight")?.value),
        holeDiameter: parseFloat(document.getElementById("tplHoleDiameter")?.value),
        holeOffset: parseFloat(document.getElementById("tplHoleOffset")?.value),
        holeCount: parseFloat(document.getElementById("tplHoleCount")?.value)
      });
    }

    ingestGeometry(result.entities, `${type}-template`, []);
    if (!controls.drawingTitle.value) controls.drawingTitle.value = result.title;
    if (!controls.projectName.value) controls.projectName.value = "Template Project";
    controls.actualWidth.value = formatNumber(result.width, 2);
    controls.actualHeight.value = formatNumber(result.height, 2);
    if (!controls.notes.value) controls.notes.value = "Generated from BlueprintCaddy template starter.";
    createBlueprintSvg();
    setMessage("Template geometry created and loaded.", false);
  } catch (error) {
    console.error(error);
    setMessage("Template creation failed. Check template inputs.", true);
  }
}

function currentUnitScales() {
  const widthValue = parseFloat(controls.actualWidth.value);
  const heightValue = parseFloat(controls.actualHeight.value);
  const bounds = state.bounds;
  if (!bounds) {
    return null;
  }
  const srcWidth = Math.max(0.0001, bounds.maxX - bounds.minX);
  const srcHeight = Math.max(0.0001, bounds.maxY - bounds.minY);
  const xScale = Number.isFinite(widthValue) && widthValue > 0 ? widthValue / srcWidth : 1;
  const yScale = Number.isFinite(heightValue) && heightValue > 0 ? heightValue / srcHeight : 1;
  return { xScale, yScale };
}

function buildBlueprintExplanation() {
  if (!state.entities.length || !state.bounds) {
    setMessage("Load or create geometry before using Explain Blueprint.", true);
    return;
  }

  const units = controls.units.value;
  const widthValue = parseFloat(controls.actualWidth.value);
  const heightValue = parseFloat(controls.actualHeight.value);
  const srcWidth = state.bounds.maxX - state.bounds.minX;
  const srcHeight = state.bounds.maxY - state.bounds.minY;
  const rects = detectRectangles(state.entities);
  const circles = detectCircles(state.entities);
  const scales = currentUnitScales();

  const overallWidth = Number.isFinite(widthValue) && widthValue > 0 ? widthValue : srcWidth;
  const overallHeight = Number.isFinite(heightValue) && heightValue > 0 ? heightValue : srcHeight;
  const avgCircleDiameter = circles.length ? circles.reduce((sum, c) => sum + c.rawDiameter * ((scales?.xScale || 1) + (scales?.yScale || 1)) / 2, 0) / circles.length : 0;

  const text = [
    "This drawing shows a 2D blueprint layout.",
    "",
    "Overall size:",
    `${formatNumber(overallWidth)} ${units} wide by ${formatNumber(overallHeight)} ${units} tall.`,
    "",
    "Features detected:",
    `- ${circles.length} circular feature${circles.length === 1 ? "" : "s"}${circles.length ? ` (avg diameter ${formatNumber(avgCircleDiameter)} ${units})` : ""}`,
    `- ${Math.max(0, rects.length - 1)} inner rectangular feature${Math.max(0, rects.length - 1) === 1 ? "" : "s"}`,
    "",
    "All dimensions shown on the blueprint should be verified before fabrication."
  ].join("\n");

  state.explanationText = text;
  controls.explainText.textContent = text;
  controls.explainPanel.hidden = false;
}

function buildCutList() {
  if (!state.entities.length || !state.bounds) {
    setMessage("Load or create geometry before generating a cut list.", true);
    return;
  }

  const rectangles = detectRectangles(state.entities);
  if (!rectangles.length) {
    setMessage("No rectangular features detected for cut list generation.", true);
    return;
  }

  const units = controls.units.value;
  const scales = currentUnitScales();
  const rows = [];

  rectangles
    .slice()
    .sort((a, b) => (b.rawWidth * b.rawHeight) - (a.rawWidth * a.rawHeight))
    .forEach((rect, index) => {
      rows.push({
        part: index === 0 ? "Panel" : `Feature ${index}`,
        qty: 1,
        width: rect.rawWidth * (scales?.xScale || 1),
        height: rect.rawHeight * (scales?.yScale || 1)
      });
    });

  const area = rows.reduce((sum, row) => sum + row.width * row.height * row.qty, 0);
  const textLines = ["CUT LIST", ""];
  rows.forEach((row) => {
    textLines.push(`${row.part}`);
    textLines.push(`${row.qty} x ${formatNumber(row.width)} ${units} x ${formatNumber(row.height)} ${units}`);
    textLines.push("");
  });
  textLines.push(`Material estimate area: ${formatNumber(area)} square ${units}`);

  const csvLines = ["Part,Qty,Width,Height,Units"];
  rows.forEach((row) => {
    csvLines.push(`${row.part},${row.qty},${formatNumber(row.width)},${formatNumber(row.height)},${units}`);
  });

  state.cutListText = textLines.join("\n");
  state.cutListCsv = csvLines.join("\n");
  controls.cutListText.textContent = state.cutListText;
  controls.cutListPanel.hidden = false;
}

function downloadTextFile(filename, content, contentType) {
  const blob = new Blob([content], { type: contentType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeBounds(minX, minY, maxX, maxY) {
  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY)
  };
}

function boxesIntersect(a, b, padding = 0) {
  return !(
    a.maxX + padding < b.minX ||
    a.minX - padding > b.maxX ||
    a.maxY + padding < b.minY ||
    a.minY - padding > b.maxY
  );
}

function estimateTextBox(centerX, centerY, text, rotate) {
  const textWidth = Math.max(18, text.length * 6.6 + 8);
  if (!rotate) {
    return normalizeBounds(centerX - textWidth / 2, centerY - 11, centerX + textWidth / 2, centerY + 3);
  }
  return normalizeBounds(centerX - 7, centerY - textWidth / 2, centerX + 7, centerY + textWidth / 2);
}

function isClear(box, blockers) {
  return blockers.every((block) => !boxesIntersect(box, block, 2));
}

function polylineBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  return { minX, minY, maxX, maxY };
}

function toFeatureBounds(rawBounds, tx, ty) {
  return normalizeBounds(tx(rawBounds.minX), ty(rawBounds.maxY), tx(rawBounds.maxX), ty(rawBounds.minY));
}

function approxEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function detectRectanglesFromPolylines(entities, tolerance) {
  const rectangles = [];

  entities.forEach((entity) => {
    if (entity.type !== "POLYLINE" || !entity.closed || !Array.isArray(entity.points) || entity.points.length < 4) {
      return;
    }

    const points = [];
    entity.points.forEach((point) => {
      const prev = points[points.length - 1];
      if (!prev || Math.abs(prev.x - point.x) > tolerance || Math.abs(prev.y - point.y) > tolerance) {
        points.push({ x: point.x, y: point.y });
      }
    });

    if (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.abs(first.x - last.x) < tolerance && Math.abs(first.y - last.y) < tolerance) {
        points.pop();
      }
    }

    if (points.length !== 4) {
      return;
    }

    const box = polylineBounds(points);
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    if (width <= tolerance || height <= tolerance) {
      return;
    }

    const corners = new Set();
    for (const point of points) {
      const onXEdge = Math.abs(point.x - box.minX) < tolerance || Math.abs(point.x - box.maxX) < tolerance;
      const onYEdge = Math.abs(point.y - box.minY) < tolerance || Math.abs(point.y - box.maxY) < tolerance;
      if (!onXEdge || !onYEdge) {
        return;
      }
      const xBit = Math.abs(point.x - box.minX) < tolerance ? "0" : "1";
      const yBit = Math.abs(point.y - box.minY) < tolerance ? "0" : "1";
      corners.add(`${xBit}${yBit}`);
    }

    if (corners.size === 4) {
      rectangles.push({
        rawBounds: box,
        rawWidth: width,
        rawHeight: height
      });
    }
  });

  return rectangles;
}

function detectRectanglesFromLineLoops(entities, tolerance) {
  const corners = [];
  const edgeMap = new Map();

  function findOrCreateCorner(x, y) {
    for (let i = 0; i < corners.length; i += 1) {
      const corner = corners[i];
      if (approxEqual(corner.x, x, tolerance) && approxEqual(corner.y, y, tolerance)) {
        return i;
      }
    }
    corners.push({ x, y });
    return corners.length - 1;
  }

  function edgeKey(a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return `${lo}:${hi}`;
  }

  function pushEdge(index, a, b) {
    if (a === b) {
      return;
    }
    const key = edgeKey(a, b);
    const entry = { index, a, b };
    const current = edgeMap.get(key) || [];
    current.push(entry);
    edgeMap.set(key, current);
  }

  entities.forEach((entity, index) => {
    if (entity.type !== "LINE") {
      return;
    }
    const { x1, y1, x2, y2 } = entity;
    const isHorizontal = approxEqual(y1, y2, tolerance);
    const isVertical = approxEqual(x1, x2, tolerance);
    if (!isHorizontal && !isVertical) {
      return;
    }
    const a = findOrCreateCorner(x1, y1);
    const b = findOrCreateCorner(x2, y2);
    pushEdge(index, a, b);
  });

  function uniqueSorted(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const out = [];
    sorted.forEach((value) => {
      if (!out.length || !approxEqual(out[out.length - 1], value, tolerance)) {
        out.push(value);
      }
    });
    return out;
  }

  function cornerAt(x, y) {
    for (let i = 0; i < corners.length; i += 1) {
      const c = corners[i];
      if (approxEqual(c.x, x, tolerance) && approxEqual(c.y, y, tolerance)) {
        return i;
      }
    }
    return -1;
  }

  function edgeBetween(a, b) {
    return edgeMap.get(edgeKey(a, b)) || [];
  }

  const xValues = uniqueSorted(corners.map((c) => c.x));
  const yValues = uniqueSorted(corners.map((c) => c.y));
  const rectangles = [];

  for (let xi = 0; xi < xValues.length; xi += 1) {
    for (let xj = xi + 1; xj < xValues.length; xj += 1) {
      const minX = xValues[xi];
      const maxX = xValues[xj];
      if (maxX - minX <= tolerance) {
        continue;
      }

      for (let yi = 0; yi < yValues.length; yi += 1) {
        for (let yj = yi + 1; yj < yValues.length; yj += 1) {
          const minY = yValues[yi];
          const maxY = yValues[yj];
          if (maxY - minY <= tolerance) {
            continue;
          }

          const lb = cornerAt(minX, minY);
          const lt = cornerAt(minX, maxY);
          const rb = cornerAt(maxX, minY);
          const rt = cornerAt(maxX, maxY);
          if ([lb, lt, rb, rt].some((id) => id < 0)) {
            continue;
          }

          const uniqueCorners = new Set([lb, lt, rb, rt]);
          if (uniqueCorners.size !== 4) {
            continue;
          }

          const leftEdges = edgeBetween(lb, lt);
          const rightEdges = edgeBetween(rb, rt);
          const topEdges = edgeBetween(lt, rt);
          const bottomEdges = edgeBetween(lb, rb);
          if (!leftEdges.length || !rightEdges.length || !topEdges.length || !bottomEdges.length) {
            continue;
          }

          let found = false;
          for (const left of leftEdges) {
            for (const right of rightEdges) {
              for (const top of topEdges) {
                for (const bottom of bottomEdges) {
                  const lineIndexes = new Set([left.index, right.index, top.index, bottom.index]);
                  if (lineIndexes.size !== 4) {
                    continue;
                  }

                  const degree = new Map([[lb, 0], [lt, 0], [rb, 0], [rt, 0]]);
                  [[lb, lt], [rb, rt], [lt, rt], [lb, rb]].forEach(([a, b]) => {
                    degree.set(a, degree.get(a) + 1);
                    degree.set(b, degree.get(b) + 1);
                  });
                  if (![...degree.values()].every((count) => count === 2)) {
                    continue;
                  }

                  rectangles.push({
                    rawBounds: { minX, minY, maxX, maxY },
                    rawWidth: maxX - minX,
                    rawHeight: maxY - minY
                  });
                  found = true;
                  break;
                }
                if (found) break;
              }
              if (found) break;
            }
            if (found) break;
          }
        }
      }
    }
  }

  return rectangles;
}

function dedupeRectangles(rectangles, tolerance) {
  const unique = [];

  rectangles.forEach((rect) => {
    const exists = unique.some((candidate) =>
      approxEqual(candidate.rawBounds.minX, rect.rawBounds.minX, tolerance) &&
      approxEqual(candidate.rawBounds.minY, rect.rawBounds.minY, tolerance) &&
      approxEqual(candidate.rawBounds.maxX, rect.rawBounds.maxX, tolerance) &&
      approxEqual(candidate.rawBounds.maxY, rect.rawBounds.maxY, tolerance)
    );
    if (!exists) {
      unique.push(rect);
    }
  });

  return unique;
}

function detectRectangles(entities) {
  const tolerance = 1e-3;
  const fromPolylines = detectRectanglesFromPolylines(entities, tolerance);
  const fromLineLoops = detectRectanglesFromLineLoops(entities, tolerance);
  return dedupeRectangles(fromPolylines.concat(fromLineLoops), tolerance);
}

function detectCircles(entities) {
  return entities
    .filter((entity) => entity.type === "CIRCLE" && Number.isFinite(entity.r) && entity.r > 0)
    .map((circle) => ({
      cx: circle.cx,
      cy: circle.cy,
      r: circle.r,
      rawDiameter: circle.r * 2
    }));
}

function renderArrowTriangle(x, y, axis, direction, size) {
  if (axis === "x") {
    const tipX = x + size * direction;
    return `<polygon points="${x},${y} ${tipX},${y - size * 0.62} ${tipX},${y + size * 0.62}" fill="#111" />`;
  }
  const tipY = y + size * direction;
  return `<polygon points="${x},${y} ${x - size * 0.62},${tipY} ${x + size * 0.62},${tipY}" fill="#111" />`;
}

function renderHorizontalDimension(spec, occupied, blockers) {
  const { x1, x2, refY, candidateYs, text } = spec;
  for (const lineY of candidateYs) {
    const textYOptions = [lineY - 6, lineY + 15];
    for (const textY of textYOptions) {
      const box = estimateTextBox((x1 + x2) / 2, textY, text, false);
      if (!isClear(box, blockers.concat(occupied))) {
        continue;
      }
      occupied.push(box);
      const arrowSize = 5;
      return `
        <line x1="${x1}" y1="${refY}" x2="${x1}" y2="${lineY}" stroke="#111" stroke-width="0.9" />
        <line x1="${x2}" y1="${refY}" x2="${x2}" y2="${lineY}" stroke="#111" stroke-width="0.9" />
        <line x1="${x1}" y1="${lineY}" x2="${x2}" y2="${lineY}" stroke="#111" stroke-width="0.9" />
        ${renderArrowTriangle(x1, lineY, "x", 1, arrowSize)}
        ${renderArrowTriangle(x2, lineY, "x", -1, arrowSize)}
        <text x="${(x1 + x2) / 2}" y="${textY}" font-size="11" text-anchor="middle" font-family="Arial">${escapeXml(text)}</text>
      `;
    }
  }
  return "";
}

function renderVerticalDimension(spec, occupied, blockers) {
  const { y1, y2, refX, candidateXs, text } = spec;
  for (const lineX of candidateXs) {
    const textXOptions = [lineX - 8, lineX + 8];
    for (const textX of textXOptions) {
      const centerY = (y1 + y2) / 2;
      const box = estimateTextBox(textX, centerY, text, true);
      if (!isClear(box, blockers.concat(occupied))) {
        continue;
      }
      occupied.push(box);
      const arrowSize = 5;
      return `
        <line x1="${refX}" y1="${y1}" x2="${lineX}" y2="${y1}" stroke="#111" stroke-width="0.9" />
        <line x1="${refX}" y1="${y2}" x2="${lineX}" y2="${y2}" stroke="#111" stroke-width="0.9" />
        <line x1="${lineX}" y1="${y1}" x2="${lineX}" y2="${y2}" stroke="#111" stroke-width="0.9" />
        ${renderArrowTriangle(lineX, y1, "y", 1, arrowSize)}
        ${renderArrowTriangle(lineX, y2, "y", -1, arrowSize)}
        <text x="${textX}" y="${centerY}" font-size="11" text-anchor="middle" font-family="Arial" transform="rotate(-90 ${textX} ${centerY})">${escapeXml(text)}</text>
      `;
    }
  }
  return "";
}

function renderCircleDiameterNote(spec, occupied, blockers) {
  const { cx, cy, r, text, drawingZone } = spec;
  const gap = 14;
  const positions = [
    { x: cx + r + gap, y: cy - r - 6, anchor: "start", leadX: cx + r, leadY: cy },
    { x: cx + r + gap, y: cy + r + 14, anchor: "start", leadX: cx + r * 0.7, leadY: cy + r * 0.7 },
    { x: cx - r - gap, y: cy - r - 6, anchor: "end", leadX: cx - r, leadY: cy },
    { x: cx - r - gap, y: cy + r + 14, anchor: "end", leadX: cx - r * 0.7, leadY: cy + r * 0.7 }
  ];

  for (const pos of positions) {
    const width = Math.max(18, text.length * 6.6 + 8);
    const box = pos.anchor === "end"
      ? normalizeBounds(pos.x - width, pos.y - 11, pos.x, pos.y + 3)
      : normalizeBounds(pos.x, pos.y - 11, pos.x + width, pos.y + 3);

    const insideDrawing = box.minX > drawingZone.minX + 4 && box.maxX < drawingZone.maxX - 4 && box.minY > drawingZone.minY + 4 && box.maxY < drawingZone.maxY - 4;
    if (!insideDrawing || !isClear(box, blockers.concat(occupied))) {
      continue;
    }

    occupied.push(box);

    const textX = pos.x;
    const textY = pos.y;
    const textEndX = pos.anchor === "end" ? pos.x - 2 : pos.x + 2;
    const textEndY = pos.y - 4;

    return `
      <line x1="${pos.leadX}" y1="${pos.leadY}" x2="${textEndX}" y2="${textEndY}" stroke="#111" stroke-width="0.9" />
      <circle cx="${pos.leadX}" cy="${pos.leadY}" r="1.5" fill="#111" />
      <text x="${textX}" y="${textY}" font-size="11" text-anchor="${pos.anchor}" font-family="Arial">${escapeXml(text)}</text>
    `;
  }

  return "";
}

function buildAutoDimensions(config) {
  const {
    entities,
    srcBounds,
    units,
    actualWidth,
    actualHeight,
    tx,
    ty,
    drawingZone,
    titleBlockRect,
    headerBandRect
  } = config;

  const srcWidth = Math.max(0.0001, srcBounds.maxX - srcBounds.minX);
  const srcHeight = Math.max(0.0001, srcBounds.maxY - srcBounds.minY);
  const xUnitPerDxf = actualWidth / srcWidth;
  const yUnitPerDxf = actualHeight / srcHeight;
  const avgUnitPerDxf = (xUnitPerDxf + yUnitPerDxf) / 2;

  const geometryBox = toFeatureBounds(srcBounds, tx, ty);
  const occupied = [];
  const fixedBlockers = [titleBlockRect, headerBandRect];

  const rectangles = detectRectangles(entities).slice(0, 18);
  const circles = detectCircles(entities).slice(0, 24);

  const rectangleFeatures = rectangles.map((rect) => ({
    rect,
    mappedBounds: toFeatureBounds(rect.rawBounds, tx, ty)
  }));
  const featureShapeBoxes = rectangleFeatures.map((feature) => feature.mappedBounds);
  circles.forEach((circle) => {
    featureShapeBoxes.push(normalizeBounds(tx(circle.cx - circle.r), ty(circle.cy + circle.r), tx(circle.cx + circle.r), ty(circle.cy - circle.r)));
  });

  const fragments = [];

  const overallWidthText = `${formatNumber(actualWidth)} ${units}`;
  const overallHeightText = `${formatNumber(actualHeight)} ${units}`;

  const preferredOverallWidthCandidates = [geometryBox.minY - 16, geometryBox.minY - 28, geometryBox.minY - 40];
  const fallbackOverallWidthCandidates = [geometryBox.minY - 10, drawingZone.minY + 14, drawingZone.minY + 22];
  const overallWidthCandidates = preferredOverallWidthCandidates
    .concat(fallbackOverallWidthCandidates)
    .filter((y, idx, arr) => arr.indexOf(y) === idx)
    .filter((y) => y > drawingZone.minY + 6 && y < geometryBox.minY - 4);
  const overallHeightCandidates = [geometryBox.minX - 24, geometryBox.minX - 38, geometryBox.minX - 52]
    .filter((x) => x > drawingZone.minX + 4);

  fragments.push(renderHorizontalDimension({
    x1: geometryBox.minX,
    x2: geometryBox.maxX,
    refY: geometryBox.minY,
    candidateYs: overallWidthCandidates,
    text: overallWidthText
  }, occupied, fixedBlockers.concat(featureShapeBoxes)));

  fragments.push(renderVerticalDimension({
    y1: geometryBox.minY,
    y2: geometryBox.maxY,
    refX: geometryBox.minX,
    candidateXs: overallHeightCandidates,
    text: overallHeightText
  }, occupied, fixedBlockers.concat(featureShapeBoxes)));

  rectangleFeatures.forEach((feature, featureIndex) => {
    const rect = feature.rect;
    const mapped = feature.mappedBounds;
    const blockers = fixedBlockers.concat(featureShapeBoxes.filter((_, idx) => idx !== featureIndex));

    const widthText = `${formatNumber(rect.rawWidth * xUnitPerDxf)} ${units}`;
    const widthCandidates = [mapped.minY - 14, mapped.maxY + 14, mapped.minY - 28, mapped.maxY + 28]
      .filter((y) => y > drawingZone.minY + 6 && y < titleBlockRect.minY - 8);

    const heightText = `${formatNumber(rect.rawHeight * yUnitPerDxf)} ${units}`;
    const heightCandidates = [mapped.maxX + 14, mapped.minX - 14, mapped.maxX + 28, mapped.minX - 28]
      .filter((x) => x > drawingZone.minX + 6 && x < drawingZone.maxX - 6);

    fragments.push(renderHorizontalDimension({
      x1: mapped.minX,
      x2: mapped.maxX,
      refY: mapped.minY,
      candidateYs: widthCandidates,
      text: widthText
    }, occupied, blockers));

    fragments.push(renderVerticalDimension({
      y1: mapped.minY,
      y2: mapped.maxY,
      refX: mapped.maxX,
      candidateXs: heightCandidates,
      text: heightText
    }, occupied, blockers));
  });

  circles.forEach((circle) => {
    const cx = tx(circle.cx);
    const cy = ty(circle.cy);
    const r = Math.max(2, Math.abs(tx(circle.cx + circle.r) - tx(circle.cx)));
    const text = `\u00D8${formatNumber(circle.rawDiameter * avgUnitPerDxf)} ${units}`;

    fragments.push(renderCircleDiameterNote({
      cx,
      cy,
      r,
      text,
      drawingZone
    }, occupied, fixedBlockers.concat(featureShapeBoxes)));
  });

  return fragments.join("\n");
}

function createBlueprintSvg() {
  if (!state.entities.length || !state.bounds) {
    setMessage("Load a DXF before generating a blueprint.", true);
    return null;
  }

  const widthValue = parseFloat(controls.actualWidth.value);
  const heightValue = parseFloat(controls.actualHeight.value);

  if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue)) {
    setMessage("Enter both actual width and actual height.", true);
    return null;
  }

  if (widthValue <= 0 || heightValue <= 0) {
    setMessage("Actual dimensions must be greater than zero.", true);
    return null;
  }

  const units = controls.units.value;
  const title = controls.drawingTitle.value.trim() || "Untitled Drawing";
  const project = controls.projectName.value.trim() || "Project not specified";
  const notes = controls.notes.value.trim() || "No notes provided.";
  const revision = controls.revision.value.trim() || "Rev A";
  const page = mapPageSize();

  const pxPerIn = 96;
  const pageWidth = page.widthIn * pxPerIn;
  const pageHeight = page.heightIn * pxPerIn;

  const margin = 32;
  const headerBandHeight = 48;
  const titleBlockHeight = 150;
  const drawingX = margin + 10;
  const drawingY = margin + headerBandHeight;
  const drawingWidth = pageWidth - margin * 2 - 20;
  const drawingHeight = pageHeight - margin - drawingY - titleBlockHeight - 16;

  const srcWidth = Math.max(0.0001, state.bounds.maxX - state.bounds.minX);
  const srcHeight = Math.max(0.0001, state.bounds.maxY - state.bounds.minY);

  const uniformScale = Math.min(widthValue / srcWidth, heightValue / srcHeight);
  const scaledWidth = srcWidth * uniformScale;
  const scaledHeight = srcHeight * uniformScale;

  const fitInset = {
    top: 30,
    right: 16,
    bottom: 18,
    left: 30
  };
  const fitWidth = Math.max(20, drawingWidth - fitInset.left - fitInset.right);
  const fitHeight = Math.max(20, drawingHeight - fitInset.top - fitInset.bottom);
  const drawScale = Math.min(fitWidth / srcWidth, fitHeight / srcHeight);
  const offsetX = drawingX + fitInset.left + (fitWidth - srcWidth * drawScale) / 2;
  const offsetY = drawingY + fitInset.top + (fitHeight - srcHeight * drawScale) / 2;

  const tx = (x) => offsetX + (x - state.bounds.minX) * drawScale;
  const ty = (y) => pageHeight - (offsetY + (y - state.bounds.minY) * drawScale);

  const geometrySvg = state.entities
    .map((entity) => entityToSvg(entity, tx, ty, drawScale, "#111", 1.1))
    .join("");

  const generated = todayStamp();
  const disclaim = "Concept / field-use layout. Not for fabrication without field verification.";
  const scaleNote = `Scaled proportionally from DXF bounds to ${formatNumber(widthValue)} ${units} x ${formatNumber(heightValue)} ${units}.`;
  const headerTitle = truncateText(title, 62);
  const titleBlockTitle = truncateText(title, 70);
  const projectDisplay = truncateText(project, 64);
  const fileDisplay = truncateText(state.fileName || "Unknown", 44);

  const drawingZone = normalizeBounds(drawingX, drawingY, drawingX + drawingWidth, drawingY + drawingHeight);
  const titleBlockRect = normalizeBounds(margin, pageHeight - margin - titleBlockHeight, pageWidth - margin, pageHeight - margin);
  const headerBandRect = normalizeBounds(margin, margin, pageWidth - margin, margin + headerBandHeight - 8);
  const innerLeft = margin;
  const innerRight = pageWidth - margin;
  const innerWidth = innerRight - innerLeft;
  const col1W = Math.round(innerWidth * 0.35);
  const col2W = Math.round(innerWidth * 0.29);
  const col3W = Math.round(innerWidth * 0.16);
  const col4W = innerWidth - col1W - col2W - col3W;
  const col1X = innerLeft;
  const col2X = col1X + col1W;
  const col3X = col2X + col2W;
  const col4X = col3X + col3W;

  const autoDimensionSvg = buildAutoDimensions({
    entities: state.entities,
    srcBounds: state.bounds,
    units,
    actualWidth: widthValue,
    actualHeight: heightValue,
    tx,
    ty,
    drawingZone,
    titleBlockRect,
    headerBandRect
  });

  const blueprint = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">
    <rect width="100%" height="100%" fill="#ffffff" />
    <rect x="${margin}" y="${margin}" width="${pageWidth - margin * 2}" height="${pageHeight - margin * 2}" fill="none" stroke="#111" stroke-width="1.8" />

    <rect x="${margin}" y="${margin}" width="${pageWidth - margin * 2}" height="${headerBandHeight - 8}" fill="#f8fbff" stroke="#111" stroke-width="0.9" />
    <line x1="${margin}" y1="${margin + headerBandHeight - 8}" x2="${pageWidth - margin}" y2="${margin + headerBandHeight - 8}" stroke="#111" stroke-width="0.9" />
    <text x="${drawingX}" y="${margin + 19}" font-size="14" font-weight="700" font-family="Arial">${escapeXml(headerTitle)}</text>
    <text x="${drawingX}" y="${margin + 35}" font-size="10.5" font-family="Arial">Project: ${escapeXml(projectDisplay)}</text>
    <text x="${pageWidth - margin - 8}" y="${margin + 19}" font-size="10.5" text-anchor="end" font-family="Arial">BlueprintCaddy | ${escapeXml(page.name)}</text>
    <text x="${pageWidth - margin - 8}" y="${margin + 35}" font-size="10.5" text-anchor="end" font-family="Arial">Generated: ${generated} | Revision: ${escapeXml(revision)}</text>

    <rect x="${drawingX}" y="${drawingY}" width="${drawingWidth}" height="${drawingHeight}" fill="#ffffff" stroke="#222" stroke-width="1" />
    ${geometrySvg}
    ${autoDimensionSvg}

    <rect x="${margin}" y="${pageHeight - margin - titleBlockHeight}" width="${pageWidth - margin * 2}" height="${titleBlockHeight}" fill="#fbfcfe" stroke="#111" stroke-width="1.8" />
    <line x1="${margin}" y1="${pageHeight - margin - titleBlockHeight + 44}" x2="${pageWidth - margin}" y2="${pageHeight - margin - titleBlockHeight + 44}" stroke="#111" stroke-width="1" />
    <line x1="${col2X}" y1="${pageHeight - margin - titleBlockHeight}" x2="${col2X}" y2="${pageHeight - margin}" stroke="#111" stroke-width="1" />
    <line x1="${col3X}" y1="${pageHeight - margin - titleBlockHeight}" x2="${col3X}" y2="${pageHeight - margin}" stroke="#111" stroke-width="1" />
    <line x1="${col4X}" y1="${pageHeight - margin - titleBlockHeight}" x2="${col4X}" y2="${pageHeight - margin}" stroke="#111" stroke-width="1" />

    <text x="${col1X + 10}" y="${pageHeight - margin - titleBlockHeight + 28}" font-size="12" font-weight="700" font-family="Arial">Drawing Title</text>
    <text x="${col1X + 10}" y="${pageHeight - margin - titleBlockHeight + 74}" font-size="15" font-family="Arial">${escapeXml(titleBlockTitle)}</text>
    <text x="${col1X + 10}" y="${pageHeight - margin - titleBlockHeight + 96}" font-size="11" font-weight="700" font-family="Arial">Project / Customer</text>
    <text x="${col1X + 10}" y="${pageHeight - margin - titleBlockHeight + 113}" font-size="11.5" font-family="Arial">${escapeXml(projectDisplay)}</text>
    <text x="${col1X + 10}" y="${pageHeight - margin - 12}" font-size="10.2" font-family="Arial">${escapeXml(disclaim)}</text>

    <text x="${col2X + 10}" y="${pageHeight - margin - titleBlockHeight + 28}" font-size="12" font-weight="700" font-family="Arial">Source + Dimensions</text>
    <text x="${col2X + 10}" y="${pageHeight - margin - titleBlockHeight + 56}" font-size="10.8" font-family="Arial">Source File: ${escapeXml(fileDisplay)}</text>
    <text x="${col2X + 10}" y="${pageHeight - margin - titleBlockHeight + 74}" font-size="10.8" font-family="Arial">Actual Width: ${formatNumber(widthValue)} ${escapeXml(units)}</text>
    <text x="${col2X + 10}" y="${pageHeight - margin - titleBlockHeight + 92}" font-size="10.8" font-family="Arial">Actual Height: ${formatNumber(heightValue)} ${escapeXml(units)}</text>
    <text x="${col2X + 10}" y="${pageHeight - margin - titleBlockHeight + 110}" font-size="10.8" font-family="Arial">Scaled Box: ${formatNumber(scaledWidth)} x ${formatNumber(scaledHeight)} ${escapeXml(units)}</text>

    <text x="${col3X + 10}" y="${pageHeight - margin - titleBlockHeight + 28}" font-size="12" font-weight="700" font-family="Arial">Sheet Info</text>
    <text x="${col3X + 10}" y="${pageHeight - margin - titleBlockHeight + 56}" font-size="10.8" font-family="Arial">Page: ${escapeXml(page.name)}</text>
    <text x="${col3X + 10}" y="${pageHeight - margin - titleBlockHeight + 74}" font-size="10.8" font-family="Arial">Date: ${generated}</text>
    <text x="${col3X + 10}" y="${pageHeight - margin - titleBlockHeight + 92}" font-size="10.8" font-family="Arial">Rev: ${escapeXml(revision)}</text>
    <text x="${col3X + 10}" y="${pageHeight - margin - titleBlockHeight + 110}" font-size="10.8" font-family="Arial">Units: ${escapeXml(units)}</text>

    <text x="${col4X + 10}" y="${pageHeight - margin - titleBlockHeight + 28}" font-size="12" font-weight="700" font-family="Arial">Scale Note + Notes</text>
    <foreignObject x="${col4X + 10}" y="${pageHeight - margin - titleBlockHeight + 40}" width="${Math.max(90, col4W - 18)}" height="${titleBlockHeight - 48}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;font-size:10.5px;color:#222;line-height:1.35;">
        <div style="margin-bottom:6px;">${escapeXml(scaleNote)}</div>
        <div>Notes: ${escapeXml(notes).replace(/\n/g, "<br>")}</div>
      </div>
    </foreignObject>
  </svg>`;

  state.blueprintSvg = blueprint;
  controls.blueprintPreview.classList.remove("empty");
  controls.blueprintPreview.innerHTML = blueprint;

  setMessage("Blueprint generated with auto-dim annotations. Export SVG or print/save PDF.", false);
  return blueprint;
}

function exportSvg() {
  if (!state.blueprintSvg) {
    setMessage("Generate a blueprint before exporting SVG.", true);
    return;
  }

  const fileRoot = (state.fileName || "blueprint").replace(/\.dxf$/i, "");
  const blob = new Blob([state.blueprintSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileRoot}-blueprint.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetAll() {
  state.fileName = "";
  state.sourceText = "";
  state.entities = [];
  state.bounds = null;
  state.unsupported = [];
  state.rawSvg = "";
  state.blueprintSvg = "";
  state.explanationText = "";
  state.cutListText = "";
  state.cutListCsv = "";
  state.pendingScanCanvas = null;

  controls.dxfFile.value = "";
  controls.dropInput.value = "";
  if (controls.sketchUpload) controls.sketchUpload.value = "";
  if (controls.sketchCameraCapture) controls.sketchCameraCapture.value = "";
  controls.drawingTitle.value = "";
  controls.projectName.value = "";
  controls.actualWidth.value = "";
  controls.actualHeight.value = "";
  controls.units.value = "in";
  controls.pagePreset.value = "letter-landscape";
  controls.orientation.value = "landscape";
  controls.revision.value = "Rev A";
  controls.notes.value = "";
  controls.templateType.value = "rect-panel";
  controls.dropLabel.textContent = "Drag and drop DXF here, or click Upload DXF above";
  controls.fileMeta.textContent = "No DXF loaded";

  controls.rawPreview.classList.add("empty");
  controls.rawPreview.textContent = "Upload or load sample to see source geometry.";
  controls.blueprintPreview.classList.add("empty");
  controls.blueprintPreview.textContent = "Generate blueprint to preview printable sheet.";
  controls.explainPanel.hidden = true;
  controls.cutListPanel.hidden = true;
  controls.explainText.textContent = "";
  controls.cutListText.textContent = "";
  controls.templatePanel.hidden = true;
  if (controls.processingModal) controls.processingModal.hidden = true;
  if (controls.scanPreviewModal) controls.scanPreviewModal.hidden = true;
  if (controls.scanPreviewImage) controls.scanPreviewImage.src = "";
  renderTemplateFields();

  renderUnsupported([]);
  setMessage("State reset. Load a DXF file to begin.", false);
}

function wireDragDrop() {
  ["dragenter", "dragover"].forEach((type) => {
    controls.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      controls.dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    controls.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      controls.dropZone.classList.remove("dragover");
    });
  });

  controls.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
    readFile(file);
  });
}

async function loadSample() {
  try {
    const response = await fetch("samples/sample-door.dxf");
    if (!response.ok) {
      throw new Error(`Sample not found (${response.status}).`);
    }
    const text = await response.text();
    parseUpload(text, "sample-door.dxf");

    if (!controls.actualWidth.value) controls.actualWidth.value = "36";
    if (!controls.actualHeight.value) controls.actualHeight.value = "78";
    if (!controls.drawingTitle.value) controls.drawingTitle.value = "Sample Access Door";
    if (!controls.projectName.value) controls.projectName.value = "BlueprintCaddy Demo";
    if (!controls.notes.value) controls.notes.value = "Sample layout generated from included DXF for workflow testing.";
    createBlueprintSvg();
  } catch (error) {
    console.error(error);
    setMessage(`Could not load sample: ${error.message}`, true);
  }
}

function syncPresetAndOrientation() {
  const [_, presetOrientation] = controls.pagePreset.value.split("-");
  if (presetOrientation) {
    controls.orientation.value = presetOrientation;
  }
}

function attachEvents() {
  controls.blueprintMenuToggle?.addEventListener("click", toggleBlueprintMenu);
  controls.blueprintMenuClose?.addEventListener("click", () => setBlueprintMenu(false));
  controls.dxfFile.addEventListener("change", (event) => readFile(event.target.files && event.target.files[0]));
  controls.dropInput.addEventListener("change", (event) => readFile(event.target.files && event.target.files[0]));
  controls.btnImportSketch?.addEventListener("click", () => controls.sketchUpload?.click());
  controls.btnScanSketch?.addEventListener("click", () => {
    const canUseCaptureInput = controls.sketchCameraCapture && ("capture" in controls.sketchCameraCapture);
    if (canUseCaptureInput) {
      controls.sketchCameraCapture.click();
      return;
    }
    controls.sketchUpload?.click();
  });
  controls.sketchUpload?.addEventListener("change", handleSketchUpload);
  controls.sketchCameraCapture?.addEventListener("change", handleSketchCameraCapture);
  if (controls.scanPreviewClose) {
    controls.scanPreviewClose.onclick = closeScanPreview;
  }
  controls.useScanBtn?.addEventListener("click", confirmUseScan);
  controls.retakeScanBtn?.addEventListener("click", () => {
    closeScanPreview();
    controls.sketchCameraCapture?.click();
  });
  controls.cancelScanBtn?.addEventListener("click", closeScanPreview);
  controls.scanPreviewModal?.addEventListener("click", (event) => {
    if (event.target && event.target.id === "scanPreviewModal") {
      closeScanPreview();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeScanPreview();
      setBlueprintMenu(false);
    }
  });
  controls.addBoxRowBtn?.addEventListener("click", () => addBoxRow());
  controls.loadPalletSampleBtn?.addEventListener("click", loadPalletSample);
  controls.clearPalletBtn?.addEventListener("click", clearPalletPlanner);
  controls.optimizePalletBtn?.addEventListener("click", handleOptimizePallet);
  controls.palletUnit?.addEventListener("change", syncPalletUnitDefaults);

  controls.generateBtn.addEventListener("click", createBlueprintSvg);
  controls.explainBtn.addEventListener("click", buildBlueprintExplanation);
  controls.cutListBtn.addEventListener("click", buildCutList);
  controls.exportBtn.addEventListener("click", exportSvg);
  controls.printBtn.addEventListener("click", () => {
    if (!state.blueprintSvg) {
      setMessage("Generate a blueprint before printing.", true);
      return;
    }
    window.print();
  });
  controls.resetBtn.addEventListener("click", resetAll);
  controls.loadSampleBtn.addEventListener("click", loadSample);
  controls.createTemplateBtn.addEventListener("click", () => {
    controls.templatePanel.hidden = !controls.templatePanel.hidden;
  });
  controls.templateType.addEventListener("change", renderTemplateFields);
  controls.applyTemplateBtn.addEventListener("click", applyTemplate);
  controls.downloadCutCsvBtn.addEventListener("click", () => {
    if (!state.cutListCsv) {
      setMessage("Generate cut list before downloading CSV.", true);
      return;
    }
    downloadTextFile("blueprint-cut-list.csv", state.cutListCsv, "text/csv;charset=utf-8");
  });
  controls.downloadCutTxtBtn.addEventListener("click", () => {
    if (!state.cutListText) {
      setMessage("Generate cut list before downloading text.", true);
      return;
    }
    downloadTextFile("blueprint-cut-list.txt", state.cutListText, "text/plain;charset=utf-8");
  });

  controls.pagePreset.addEventListener("change", syncPresetAndOrientation);
}

renderTemplateFields();
wireDragDrop();
initPalletPlanner();
attachEvents();
resetAll();
