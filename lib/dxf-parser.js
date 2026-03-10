(function () {
  function parseNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function groupPairs(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const pairs = [];
    for (let i = 0; i < lines.length; i += 2) {
      pairs.push({ code: (lines[i] || "").trim(), value: (lines[i + 1] || "").trim() });
    }
    return pairs;
  }

  function computeBounds(entities) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    function include(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    entities.forEach((entity) => {
      if (entity.type === "LINE") {
        include(entity.x1, entity.y1);
        include(entity.x2, entity.y2);
      }
      if (entity.type === "POLYLINE") {
        entity.points.forEach((p) => include(p.x, p.y));
      }
      if (entity.type === "CIRCLE" || entity.type === "ARC") {
        include(entity.cx - entity.r, entity.cy - entity.r);
        include(entity.cx + entity.r, entity.cy + entity.r);
      }
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }

    return { minX, minY, maxX, maxY };
  }

  function parseDXF(text) {
    const pairs = groupPairs(text);
    const entities = [];
    const unsupportedCounts = {};

    function addUnsupported(name) {
      const key = name || "UNKNOWN";
      unsupportedCounts[key] = (unsupportedCounts[key] || 0) + 1;
    }

    let i = 0;
    while (i < pairs.length) {
      const pair = pairs[i];
      if (pair.code !== "0") {
        i += 1;
        continue;
      }

      const type = pair.value.toUpperCase();

      if (type === "LINE") {
        let x1 = null;
        let y1 = null;
        let x2 = null;
        let y2 = null;
        i += 1;
        while (i < pairs.length && pairs[i].code !== "0") {
          const code = pairs[i].code;
          const value = parseNumber(pairs[i].value);
          if (code === "10") x1 = value;
          if (code === "20") y1 = value;
          if (code === "11") x2 = value;
          if (code === "21") y2 = value;
          i += 1;
        }
        if ([x1, y1, x2, y2].every(Number.isFinite)) {
          entities.push({ type: "LINE", x1, y1, x2, y2 });
        }
        continue;
      }

      if (type === "LWPOLYLINE") {
        const points = [];
        let pendingX = null;
        let closed = false;

        i += 1;
        while (i < pairs.length && pairs[i].code !== "0") {
          const code = pairs[i].code;
          if (code === "10") {
            pendingX = parseNumber(pairs[i].value);
          }
          if (code === "20" && Number.isFinite(pendingX)) {
            const y = parseNumber(pairs[i].value);
            if (Number.isFinite(y)) {
              points.push({ x: pendingX, y });
            }
            pendingX = null;
          }
          if (code === "70") {
            const flag = parseInt(pairs[i].value, 10);
            closed = (flag & 1) === 1;
          }
          i += 1;
        }
        if (points.length > 1) {
          entities.push({ type: "POLYLINE", points, closed });
        }
        continue;
      }

      if (type === "POLYLINE") {
        const points = [];
        let closed = false;

        i += 1;
        while (i < pairs.length) {
          const current = pairs[i];
          if (current.code === "0" && current.value.toUpperCase() === "SEQEND") {
            i += 1;
            break;
          }
          if (current.code === "70") {
            const flag = parseInt(current.value, 10);
            closed = (flag & 1) === 1;
            i += 1;
            continue;
          }
          if (current.code === "0" && current.value.toUpperCase() === "VERTEX") {
            let x = null;
            let y = null;
            i += 1;
            while (i < pairs.length) {
              const p = pairs[i];
              if (p.code === "0" && (p.value.toUpperCase() === "VERTEX" || p.value.toUpperCase() === "SEQEND")) {
                break;
              }
              if (p.code === "10") x = parseNumber(p.value);
              if (p.code === "20") y = parseNumber(p.value);
              i += 1;
            }
            if (Number.isFinite(x) && Number.isFinite(y)) {
              points.push({ x, y });
            }
            continue;
          }
          i += 1;
        }

        if (points.length > 1) {
          entities.push({ type: "POLYLINE", points, closed });
        }
        continue;
      }

      if (type === "CIRCLE") {
        let cx = null;
        let cy = null;
        let r = null;

        i += 1;
        while (i < pairs.length && pairs[i].code !== "0") {
          const code = pairs[i].code;
          const value = parseNumber(pairs[i].value);
          if (code === "10") cx = value;
          if (code === "20") cy = value;
          if (code === "40") r = value;
          i += 1;
        }

        if ([cx, cy, r].every(Number.isFinite) && r > 0) {
          entities.push({ type: "CIRCLE", cx, cy, r });
        }
        continue;
      }

      if (type === "ARC") {
        let cx = null;
        let cy = null;
        let r = null;
        let startAngle = null;
        let endAngle = null;

        i += 1;
        while (i < pairs.length && pairs[i].code !== "0") {
          const code = pairs[i].code;
          const value = parseNumber(pairs[i].value);
          if (code === "10") cx = value;
          if (code === "20") cy = value;
          if (code === "40") r = value;
          if (code === "50") startAngle = value;
          if (code === "51") endAngle = value;
          i += 1;
        }

        if ([cx, cy, r, startAngle, endAngle].every(Number.isFinite) && r > 0) {
          entities.push({ type: "ARC", cx, cy, r, startAngle, endAngle });
        }
        continue;
      }

      const shouldTrack = ![
        "SECTION", "ENDSEC", "ENTITIES", "EOF", "HEADER", "TABLES", "BLOCKS", "OBJECTS",
        "LAYER", "LINE", "LTYPE", "STYLE", "VIEW", "UCS", "VPORT", "APPID", "DIMSTYLE", "BLOCK", "ENDBLK"
      ].includes(type);
      if (shouldTrack) {
        addUnsupported(type);
      }

      i += 1;
      while (i < pairs.length && pairs[i].code !== "0") {
        i += 1;
      }
    }

    const bounds = computeBounds(entities);

    return {
      entities,
      bounds,
      unsupported: Object.keys(unsupportedCounts)
        .sort()
        .map((name) => ({ type: name, count: unsupportedCounts[name] }))
    };
  }

  window.DxfParserLite = {
    parseDXF
  };
})();