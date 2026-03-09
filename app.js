const state = {
  fileName: "",
  sourceText: "",
  entities: [],
  bounds: null,
  unsupported: [],
  rawSvg: "",
  blueprintSvg: ""
};

const PAGE_PRESETS = {
  letter: { widthIn: 11, heightIn: 8.5 },
  tabloid: { widthIn: 17, heightIn: 11 }
};

const controls = {
  dxfFile: document.getElementById("dxfFile"),
  dropInput: document.getElementById("dxfDropInput"),
  dropZone: document.getElementById("dropZone"),
  dropLabel: document.getElementById("dropLabel"),
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
  fileMeta: document.getElementById("fileMeta")
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

    state.fileName = fileName;
    state.sourceText = text;
    state.entities = parsed.entities;
    state.bounds = parsed.bounds;
    state.unsupported = parsed.unsupported;
    state.rawSvg = renderSourceSvg(parsed.entities, parsed.bounds);

    controls.rawPreview.classList.remove("empty");
    controls.rawPreview.innerHTML = state.rawSvg;

    const rawWidth = parsed.bounds.maxX - parsed.bounds.minX;
    const rawHeight = parsed.bounds.maxY - parsed.bounds.minY;
    controls.fileMeta.textContent = `${fileName} | ${parsed.entities.length} supported entities | Source bounds ${formatNumber(rawWidth)} x ${formatNumber(rawHeight)}`;
    controls.dropLabel.textContent = `Loaded: ${fileName}`;

    renderUnsupported(parsed.unsupported);
    setMessage("DXF loaded. Enter actual dimensions and click Generate Blueprint.", false);
  } catch (error) {
    console.error(error);
    setMessage(`Invalid DXF: ${error.message}`, true);
  }
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
  const titleBlockHeight = 140;
  const drawingX = margin + 10;
  const drawingY = margin + 10;
  const drawingWidth = pageWidth - margin * 2 - 20;
  const drawingHeight = pageHeight - margin * 2 - titleBlockHeight - 20;

  const srcWidth = Math.max(0.0001, state.bounds.maxX - state.bounds.minX);
  const srcHeight = Math.max(0.0001, state.bounds.maxY - state.bounds.minY);

  const uniformScale = Math.min(widthValue / srcWidth, heightValue / srcHeight);
  const scaledWidth = srcWidth * uniformScale;
  const scaledHeight = srcHeight * uniformScale;

  const drawScale = Math.min(drawingWidth / srcWidth, drawingHeight / srcHeight);
  const offsetX = drawingX + (drawingWidth - srcWidth * drawScale) / 2;
  const offsetY = drawingY + (drawingHeight - srcHeight * drawScale) / 2;

  const tx = (x) => offsetX + (x - state.bounds.minX) * drawScale;
  const ty = (y) => pageHeight - (offsetY + (y - state.bounds.minY) * drawScale);

  const geometrySvg = state.entities
    .map((entity) => entityToSvg(entity, tx, ty, drawScale, "#111", 1.1))
    .join("");

  const generated = todayStamp();
  const disclaim = "Concept / field-use layout. Not for fabrication without field verification.";
  const scaleNote = `Scaled proportionally from DXF bounds to ${formatNumber(widthValue)} ${units} x ${formatNumber(heightValue)} ${units}.`;

  const blueprint = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">
    <rect width="100%" height="100%" fill="#ffffff" />
    <rect x="${margin}" y="${margin}" width="${pageWidth - margin * 2}" height="${pageHeight - margin * 2}" fill="none" stroke="#111" stroke-width="1.8" />

    <rect x="${drawingX}" y="${drawingY}" width="${drawingWidth}" height="${drawingHeight}" fill="#ffffff" stroke="#222" stroke-width="1" />
    ${geometrySvg}

    <rect x="${margin}" y="${pageHeight - margin - titleBlockHeight}" width="${pageWidth - margin * 2}" height="${titleBlockHeight}" fill="#fbfcfe" stroke="#111" stroke-width="1.8" />
    <line x1="${margin}" y1="${pageHeight - margin - titleBlockHeight + 40}" x2="${pageWidth - margin}" y2="${pageHeight - margin - titleBlockHeight + 40}" stroke="#111" stroke-width="1" />
    <line x1="${pageWidth - margin - 290}" y1="${pageHeight - margin - titleBlockHeight}" x2="${pageWidth - margin - 290}" y2="${pageHeight - margin}" stroke="#111" stroke-width="1" />
    <line x1="${pageWidth - margin - 200}" y1="${pageHeight - margin - titleBlockHeight}" x2="${pageWidth - margin - 200}" y2="${pageHeight - margin}" stroke="#111" stroke-width="1" />
    <line x1="${pageWidth - margin - 110}" y1="${pageHeight - margin - titleBlockHeight}" x2="${pageWidth - margin - 110}" y2="${pageHeight - margin}" stroke="#111" stroke-width="1" />

    <text x="${margin + 10}" y="${pageHeight - margin - titleBlockHeight + 25}" font-size="13" font-weight="700" font-family="Arial">Drawing Title</text>
    <text x="${margin + 10}" y="${pageHeight - margin - titleBlockHeight + 60}" font-size="18" font-family="Arial">${escapeXml(title)}</text>

    <text x="${margin + 10}" y="${pageHeight - margin - titleBlockHeight + 87}" font-size="12" font-weight="700" font-family="Arial">Project / Customer</text>
    <text x="${margin + 10}" y="${pageHeight - margin - titleBlockHeight + 104}" font-size="13" font-family="Arial">${escapeXml(project)}</text>

    <text x="${margin + 10}" y="${pageHeight - margin - titleBlockHeight + 124}" font-size="11" font-family="Arial">${escapeXml(disclaim)}</text>

    <text x="${pageWidth - margin - 280}" y="${pageHeight - margin - titleBlockHeight + 24}" font-size="11" font-weight="700" font-family="Arial">BlueprintCaddy</text>
    <text x="${pageWidth - margin - 280}" y="${pageHeight - margin - titleBlockHeight + 58}" font-size="11" font-family="Arial">Source File: ${escapeXml(state.fileName || "Unknown")}</text>
    <text x="${pageWidth - margin - 280}" y="${pageHeight - margin - titleBlockHeight + 74}" font-size="11" font-family="Arial">Date Generated: ${generated}</text>
    <text x="${pageWidth - margin - 280}" y="${pageHeight - margin - titleBlockHeight + 90}" font-size="11" font-family="Arial">Page Size: ${escapeXml(page.name)}</text>
    <text x="${pageWidth - margin - 280}" y="${pageHeight - margin - titleBlockHeight + 106}" font-size="11" font-family="Arial">Actual Width: ${formatNumber(widthValue)} ${escapeXml(units)}</text>
    <text x="${pageWidth - margin - 280}" y="${pageHeight - margin - titleBlockHeight + 122}" font-size="11" font-family="Arial">Actual Height: ${formatNumber(heightValue)} ${escapeXml(units)}</text>

    <text x="${pageWidth - margin - 190}" y="${pageHeight - margin - titleBlockHeight + 24}" font-size="11" font-weight="700" font-family="Arial">Revision</text>
    <text x="${pageWidth - margin - 190}" y="${pageHeight - margin - titleBlockHeight + 58}" font-size="16" font-family="Arial">${escapeXml(revision)}</text>

    <text x="${pageWidth - margin - 100}" y="${pageHeight - margin - titleBlockHeight + 24}" font-size="11" font-weight="700" font-family="Arial">Scale Note</text>
    <text x="${pageWidth - margin - 100}" y="${pageHeight - margin - titleBlockHeight + 58}" font-size="10.5" font-family="Arial">${escapeXml(scaleNote)}</text>
    <text x="${pageWidth - margin - 100}" y="${pageHeight - margin - titleBlockHeight + 74}" font-size="10.5" font-family="Arial">Resulting scaled box: ${formatNumber(scaledWidth)} x ${formatNumber(scaledHeight)} ${escapeXml(units)}</text>

    <text x="${drawingX}" y="${drawingY - 8}" font-size="11" font-family="Arial">Dimension summary: ${formatNumber(widthValue)} x ${formatNumber(heightValue)} ${escapeXml(units)}</text>
    <text x="${drawingX + 360}" y="${drawingY - 8}" font-size="11" font-family="Arial">${escapeXml(scaleNote)}</text>

    <foreignObject x="${margin + 8}" y="${pageHeight - margin - 46}" width="${pageWidth - margin * 2 - 16}" height="36">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;font-size:10px;color:#222;line-height:1.3;">Notes: ${escapeXml(notes).replace(/\n/g, "<br>")}</div>
    </foreignObject>
  </svg>`;

  state.blueprintSvg = blueprint;
  controls.blueprintPreview.classList.remove("empty");
  controls.blueprintPreview.innerHTML = blueprint;

  setMessage("Blueprint generated. Export SVG or print/save PDF.", false);
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

  controls.dxfFile.value = "";
  controls.dropInput.value = "";
  controls.drawingTitle.value = "";
  controls.projectName.value = "";
  controls.actualWidth.value = "";
  controls.actualHeight.value = "";
  controls.units.value = "in";
  controls.pagePreset.value = "letter-landscape";
  controls.orientation.value = "landscape";
  controls.revision.value = "Rev A";
  controls.notes.value = "";
  controls.dropLabel.textContent = "Drag and drop DXF here, or click Upload DXF above";
  controls.fileMeta.textContent = "No DXF loaded";

  controls.rawPreview.classList.add("empty");
  controls.rawPreview.textContent = "Upload or load sample to see source geometry.";
  controls.blueprintPreview.classList.add("empty");
  controls.blueprintPreview.textContent = "Generate blueprint to preview printable sheet.";

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
  controls.dxfFile.addEventListener("change", (event) => readFile(event.target.files && event.target.files[0]));
  controls.dropInput.addEventListener("change", (event) => readFile(event.target.files && event.target.files[0]));

  controls.generateBtn.addEventListener("click", createBlueprintSvg);
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

  controls.pagePreset.addEventListener("change", syncPresetAndOrientation);
}

wireDragDrop();
attachEvents();
resetAll();