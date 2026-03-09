const state = {
  fileName: '',
  entities: [],
  bounds: null,
  sourceSvg: '',
  blueprintSvg: ''
};

const els = {
  dxfFile: document.getElementById('dxfFile'),
  dropZone: document.getElementById('dropZone'),
  fileLabel: document.getElementById('fileLabel'),
  drawingTitle: document.getElementById('drawingTitle'),
  units: document.getElementById('units'),
  realWidth: document.getElementById('realWidth'),
  realHeight: document.getElementById('realHeight'),
  projectName: document.getElementById('projectName'),
  drawingNumber: document.getElementById('drawingNumber'),
  revision: document.getElementById('revision'),
  drawnBy: document.getElementById('drawnBy'),
  notes: document.getElementById('notes'),
  generateBtn: document.getElementById('generateBtn'),
  downloadSvgBtn: document.getElementById('downloadSvgBtn'),
  printBtn: document.getElementById('printBtn'),
  status: document.getElementById('status'),
  previewWrap: document.getElementById('previewWrap'),
  geometrySummary: document.getElementById('geometrySummary')
};

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? '#fca5a5' : '#cbd5e1';
}

function readFile(file) {
  state.fileName = file.name;
  els.fileLabel.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || '');
      const parsed = parseDXF(text);
      state.entities = parsed.entities;
      state.bounds = parsed.bounds;
      if (!state.entities.length || !state.bounds) {
        throw new Error('No supported 2D geometry found in this DXF.');
      }
      const w = (state.bounds.maxX - state.bounds.minX) || 1;
      const h = (state.bounds.maxY - state.bounds.minY) || 1;
      els.geometrySummary.textContent = `${state.entities.length} entities • source size ${formatNum(w)} × ${formatNum(h)}`;
      setStatus('DXF loaded. Click Generate Blueprint.');
      generateBlueprint();
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Failed to parse DXF.', true);
    }
  };
  reader.readAsText(file);
}

function formatNum(value) {
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function groupPairs(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    pairs.push({ code: (lines[i] || '').trim(), value: (lines[i + 1] || '').trim() });
  }
  return pairs;
}

function parseDXF(text) {
  const pairs = groupPairs(text);
  const entities = [];
  let i = 0;

  const pushEntity = (entity) => {
    if (!entity) return;
    entities.push(entity);
  };

  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === '0') {
      const type = p.value.toUpperCase();
      if (type === 'LINE') {
        let x1, y1, x2, y2;
        i++;
        while (i < pairs.length && pairs[i].code !== '0') {
          const c = pairs[i].code;
          const v = parseFloat(pairs[i].value);
          if (c === '10') x1 = v;
          if (c === '20') y1 = v;
          if (c === '11') x2 = v;
          if (c === '21') y2 = v;
          i++;
        }
        pushEntity((isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) ? { type: 'LINE', x1, y1, x2, y2 } : null);
        continue;
      }
      if (type === 'CIRCLE') {
        let cx, cy, r;
        i++;
        while (i < pairs.length && pairs[i].code !== '0') {
          const c = pairs[i].code;
          const v = parseFloat(pairs[i].value);
          if (c === '10') cx = v;
          if (c === '20') cy = v;
          if (c === '40') r = v;
          i++;
        }
        pushEntity((isFinite(cx) && isFinite(cy) && isFinite(r)) ? { type: 'CIRCLE', cx, cy, r } : null);
        continue;
      }
      if (type === 'ARC') {
        let cx, cy, r, startAngle, endAngle;
        i++;
        while (i < pairs.length && pairs[i].code !== '0') {
          const c = pairs[i].code;
          const v = parseFloat(pairs[i].value);
          if (c === '10') cx = v;
          if (c === '20') cy = v;
          if (c === '40') r = v;
          if (c === '50') startAngle = v;
          if (c === '51') endAngle = v;
          i++;
        }
        pushEntity((isFinite(cx) && isFinite(cy) && isFinite(r) && isFinite(startAngle) && isFinite(endAngle))
          ? { type: 'ARC', cx, cy, r, startAngle, endAngle }
          : null);
        continue;
      }
      if (type === 'LWPOLYLINE') {
        let points = [];
        let closed = false;
        let pendingX = null;
        i++;
        while (i < pairs.length && pairs[i].code !== '0') {
          const c = pairs[i].code;
          const raw = pairs[i].value;
          if (c === '10') pendingX = parseFloat(raw);
          if (c === '20' && pendingX !== null) {
            points.push({ x: pendingX, y: parseFloat(raw) });
            pendingX = null;
          }
          if (c === '70') {
            const flag = parseInt(raw, 10);
            closed = (flag & 1) === 1;
          }
          i++;
        }
        if (points.length > 1) pushEntity({ type: 'POLYLINE', points, closed });
        continue;
      }
      if (type === 'POLYLINE') {
        let points = [];
        let closed = false;
        i++;
        while (i < pairs.length) {
          const current = pairs[i];
          if (current.code === '0' && current.value.toUpperCase() === 'SEQEND') {
            i++;
            break;
          }
          if (current.code === '70') {
            const flag = parseInt(current.value, 10);
            closed = (flag & 1) === 1;
          }
          if (current.code === '0' && current.value.toUpperCase() === 'VERTEX') {
            let x, y;
            i++;
            while (i < pairs.length && !(pairs[i].code === '0' && ['VERTEX', 'SEQEND'].includes(pairs[i].value.toUpperCase()))) {
              if (pairs[i].code === '10') x = parseFloat(pairs[i].value);
              if (pairs[i].code === '20') y = parseFloat(pairs[i].value);
              i++;
            }
            if (isFinite(x) && isFinite(y)) points.push({ x, y });
            continue;
          }
          i++;
        }
        if (points.length > 1) pushEntity({ type: 'POLYLINE', points, closed });
        continue;
      }
    }
    i++;
  }

  const bounds = computeBounds(entities);
  return { entities, bounds };
}

function computeBounds(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x, y) => {
    if (!isFinite(x) || !isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const e of entities) {
    if (e.type === 'LINE') {
      include(e.x1, e.y1); include(e.x2, e.y2);
    } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
      include(e.cx - e.r, e.cy - e.r);
      include(e.cx + e.r, e.cy + e.r);
    } else if (e.type === 'POLYLINE') {
      e.points.forEach(p => include(p.x, p.y));
    }
  }

  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function degToRad(d) { return d * Math.PI / 180; }

function svgArcPath(cx, cy, r, startAngle, endAngle, tx, ty, scale) {
  const sx = tx(cx + Math.cos(degToRad(startAngle)) * r);
  const sy = ty(cy + Math.sin(degToRad(startAngle)) * r);
  const ex = tx(cx + Math.cos(degToRad(endAngle)) * r);
  const ey = ty(cy + Math.sin(degToRad(endAngle)) * r);
  let delta = endAngle - startAngle;
  if (delta < 0) delta += 360;
  const largeArc = delta > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r * scale} ${r * scale} 0 ${largeArc} 1 ${ex} ${ey}`;
}

function renderGeometrySvg(entities, bounds, originX, originY, drawW, drawH) {
  const srcW = Math.max(0.0001, bounds.maxX - bounds.minX);
  const srcH = Math.max(0.0001, bounds.maxY - bounds.minY);
  const scale = Math.min(drawW / srcW, drawH / srcH);
  const offsetX = originX + (drawW - srcW * scale) / 2;
  const offsetY = originY + (drawH - srcH * scale) / 2;

  const tx = x => offsetX + (x - bounds.minX) * scale;
  const ty = y => originY + drawH - ((y - bounds.minY) * scale + (drawH - srcH * scale) / 2);

  let out = '';
  for (const e of entities) {
    if (e.type === 'LINE') {
      out += `<line x1="${tx(e.x1)}" y1="${ty(e.y1)}" x2="${tx(e.x2)}" y2="${ty(e.y2)}" stroke="#111" stroke-width="1.2" />`;
    } else if (e.type === 'CIRCLE') {
      out += `<circle cx="${tx(e.cx)}" cy="${ty(e.cy)}" r="${e.r * scale}" fill="none" stroke="#111" stroke-width="1.2" />`;
    } else if (e.type === 'ARC') {
      out += `<path d="${svgArcPath(e.cx, e.cy, e.r, e.startAngle, e.endAngle, tx, ty, scale)}" fill="none" stroke="#111" stroke-width="1.2" />`;
    } else if (e.type === 'POLYLINE') {
      const points = e.points.map(p => `${tx(p.x)},${ty(p.y)}`).join(' ');
      out += `<polyline points="${points}" fill="none" stroke="#111" stroke-width="1.2" ${e.closed ? 'stroke-linejoin="round"' : ''} />`;
      if (e.closed && e.points.length > 2) {
        out += `<line x1="${tx(e.points[e.points.length - 1].x)}" y1="${ty(e.points[e.points.length - 1].y)}" x2="${tx(e.points[0].x)}" y2="${ty(e.points[0].y)}" stroke="#111" stroke-width="1.2" />`;
      }
    }
  }
  return out;
}

function renderDimensionLine(x1, y1, x2, y2, text, rotate = false) {
  const markerA = rotate
    ? `<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1 + 12}" stroke="#111" stroke-width="1" />
       <line x1="${x2}" y1="${y2}" x2="${x2}" y2="${y2 - 12}" stroke="#111" stroke-width="1" />`
    : `<line x1="${x1}" y1="${y1}" x2="${x1 + 12}" y2="${y1}" stroke="#111" stroke-width="1" />
       <line x1="${x2}" y1="${y2}" x2="${x2 - 12}" y2="${y2}" stroke="#111" stroke-width="1" />`;
  const tx = rotate ? x1 - 12 : (x1 + x2) / 2;
  const ty = rotate ? (y1 + y2) / 2 : y1 - 6;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="1" />
    ${markerA}
    <text x="${tx}" y="${ty}" font-size="14" text-anchor="middle" ${rotate ? `transform="rotate(-90 ${tx} ${ty})"` : ''}>${esc(text)}</text>`;
}

function generateBlueprint() {
  if (!state.entities.length || !state.bounds) {
    setStatus('Load a DXF file first.', true);
    return;
  }

  const title = els.drawingTitle.value.trim() || 'Blueprint Drawing';
  const project = els.projectName.value.trim() || 'Project';
  const units = els.units.value;
  const realWidth = parseFloat(els.realWidth.value);
  const realHeight = parseFloat(els.realHeight.value);
  const drawingNumber = els.drawingNumber.value.trim() || 'A-001';
  const revision = els.revision.value.trim() || '0';
  const drawnBy = els.drawnBy.value.trim() || 'Unknown';
  const notes = els.notes.value.trim();

  if (!(realWidth > 0) || !(realHeight > 0)) {
    setStatus('Enter positive real width and height values.', true);
    return;
  }

  const pageW = 1400;
  const pageH = 990;
  const margin = 40;
  const titleBlockH = 150;
  const drawX = 110;
  const drawY = 80;
  const drawW = pageW - 220;
  const drawH = pageH - titleBlockH - 150;
  const today = new Date().toISOString().slice(0, 10);

  const sourceW = Math.max(0.0001, state.bounds.maxX - state.bounds.minX);
  const sourceH = Math.max(0.0001, state.bounds.maxY - state.bounds.minY);
  const xScale = realWidth / sourceW;
  const yScale = realHeight / sourceH;
  const scaleNote = `Scaled to ${formatNum(realWidth)} ${units} × ${formatNum(realHeight)} ${units}`;

  const geometry = renderGeometrySvg(state.entities, state.bounds, drawX, drawY, drawW, drawH);

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
    <defs>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="#fff" />
    <rect x="${margin}" y="${margin}" width="${pageW - margin * 2}" height="${pageH - margin * 2}" fill="none" stroke="#111" stroke-width="2" />
    <rect x="${drawX}" y="${drawY}" width="${drawW}" height="${drawH}" fill="url(#grid)" stroke="#111" stroke-width="1.5" />

    <text x="${margin + 10}" y="${margin - 12 + 30}" font-family="Arial" font-size="30" font-weight="700">${esc(title)}</text>
    <text x="${pageW - margin - 10}" y="${margin - 12 + 30}" font-family="Arial" font-size="14" text-anchor="end">DXF Blueprint Generator</text>

    ${geometry}

    ${renderDimensionLine(drawX, drawY + drawH + 36, drawX + drawW, drawY + drawH + 36, `${formatNum(realWidth)} ${units}`)}
    ${renderDimensionLine(drawX - 36, drawY + drawH, drawX - 36, drawY, `${formatNum(realHeight)} ${units}`, true)}

    <rect x="${margin}" y="${pageH - titleBlockH - margin}" width="${pageW - margin * 2}" height="${titleBlockH}" fill="#fff" stroke="#111" stroke-width="2" />
    <line x1="${margin}" y1="${pageH - titleBlockH - margin + 48}" x2="${pageW - margin}" y2="${pageH - titleBlockH - margin + 48}" stroke="#111" stroke-width="1" />
    <line x1="${margin + 720}" y1="${pageH - titleBlockH - margin}" x2="${margin + 720}" y2="${pageH - margin}" stroke="#111" stroke-width="1" />
    <line x1="${margin + 930}" y1="${pageH - titleBlockH - margin}" x2="${margin + 930}" y2="${pageH - margin}" stroke="#111" stroke-width="1" />
    <line x1="${margin + 1080}" y1="${pageH - titleBlockH - margin}" x2="${margin + 1080}" y2="${pageH - margin}" stroke="#111" stroke-width="1" />
    <line x1="${margin + 1170}" y1="${pageH - titleBlockH - margin}" x2="${margin + 1170}" y2="${pageH - margin}" stroke="#111" stroke-width="1" />

    <text x="${margin + 12}" y="${pageH - titleBlockH - margin + 30}" font-size="14" font-weight="700">PROJECT</text>
    <text x="${margin + 12}" y="${pageH - titleBlockH - margin + 92}" font-size="20">${esc(project)}</text>

    <text x="${margin + 732}" y="${pageH - titleBlockH - margin + 24}" font-size="12" font-weight="700">DRAWING NO.</text>
    <text x="${margin + 732}" y="${pageH - titleBlockH - margin + 56}" font-size="18">${esc(drawingNumber)}</text>

    <text x="${margin + 942}" y="${pageH - titleBlockH - margin + 24}" font-size="12" font-weight="700">REV</text>
    <text x="${margin + 942}" y="${pageH - titleBlockH - margin + 56}" font-size="18">${esc(revision)}</text>

    <text x="${margin + 1092}" y="${pageH - titleBlockH - margin + 24}" font-size="12" font-weight="700">DATE</text>
    <text x="${margin + 1092}" y="${pageH - titleBlockH - margin + 56}" font-size="18">${today}</text>

    <text x="${margin + 1182}" y="${pageH - titleBlockH - margin + 24}" font-size="12" font-weight="700">DRAWN BY</text>
    <text x="${margin + 1182}" y="${pageH - titleBlockH - margin + 56}" font-size="18">${esc(drawnBy)}</text>

    <text x="${margin + 12}" y="${pageH - titleBlockH - margin + 72}" font-size="12" font-weight="700">NOTES</text>
    <text x="${margin + 12}" y="${pageH - titleBlockH - margin + 112}" font-size="13">${esc(notes).slice(0, 145)}</text>

    <text x="${margin + 732}" y="${pageH - titleBlockH - margin + 92}" font-size="12" font-weight="700">SOURCE FILE</text>
    <text x="${margin + 732}" y="${pageH - titleBlockH - margin + 112}" font-size="14">${esc(state.fileName || 'Uploaded DXF')}</text>

    <text x="${margin + 942}" y="${pageH - titleBlockH - margin + 92}" font-size="12" font-weight="700">OVERALL SIZE</text>
    <text x="${margin + 942}" y="${pageH - titleBlockH - margin + 112}" font-size="14">${formatNum(realWidth)} × ${formatNum(realHeight)} ${units}</text>

    <text x="${margin + 1092}" y="${pageH - titleBlockH - margin + 92}" font-size="12" font-weight="700">SOURCE BBOX</text>
    <text x="${margin + 1092}" y="${pageH - titleBlockH - margin + 112}" font-size="14">${formatNum(sourceW)} × ${formatNum(sourceH)}</text>

    <text x="${margin + 1182}" y="${pageH - titleBlockH - margin + 92}" font-size="12" font-weight="700">SCALE INFO</text>
    <text x="${margin + 1182}" y="${pageH - titleBlockH - margin + 112}" font-size="14">${esc(scaleNote)}</text>

    <text x="${drawX}" y="${drawY - 18}" font-size="13">X Scale: ${xScale.toFixed(4)} per DXF unit</text>
    <text x="${drawX + 240}" y="${drawY - 18}" font-size="13">Y Scale: ${yScale.toFixed(4)} per DXF unit</text>
  </svg>`;

  state.blueprintSvg = svg;
  els.previewWrap.innerHTML = svg;
  setStatus('Blueprint generated. Use Download SVG or Print / Save PDF.');
}

function downloadSvg() {
  if (!state.blueprintSvg) {
    setStatus('Generate a blueprint first.', true);
    return;
  }
  const blob = new Blob([state.blueprintSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.fileName.replace(/\.dxf$/i, '') || 'blueprint') + '_blueprint.svg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

els.dxfFile.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) readFile(file);
});

['dragenter', 'dragover'].forEach(type => {
  els.dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach(type => {
  els.dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropZone.classList.remove('dragover');
  });
});
els.dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file) readFile(file);
});

els.generateBtn.addEventListener('click', generateBlueprint);
els.downloadSvgBtn.addEventListener('click', downloadSvg);
els.printBtn.addEventListener('click', () => {
  if (!state.blueprintSvg) {
    setStatus('Generate a blueprint first.', true);
    return;
  }
  window.print();
});

['drawingTitle', 'units', 'realWidth', 'realHeight', 'projectName', 'drawingNumber', 'revision', 'drawnBy', 'notes']
  .forEach(id => els[id].addEventListener('input', () => {
    if (state.entities.length) generateBlueprint();
  }));
