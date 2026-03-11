function parsePolylinesFromSvg(svgText) {
  const polylines = [];
  const polylineRegex = /<polyline\b[^>]*\bpoints\s*=\s*"([^"]+)"[^>]*>/gi;
  let match;
  while ((match = polylineRegex.exec(svgText))) {
    const pointsText = match[1] || "";
    const points = pointsText
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map((value) => Number.parseFloat(value)))
      .filter((pair) => pair.length === 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

    if (points.length >= 2) {
      polylines.push(points);
    }
  }
  return polylines;
}

function dxfHeader() {
  return ["0", "SECTION", "2", "HEADER", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
}

function dxfFooter() {
  return ["0", "ENDSEC", "0", "EOF"];
}

function lineEntity(x1, y1, x2, y2) {
  return [
    "0", "LINE",
    "8", "0",
    "10", String(x1),
    "20", String(y1),
    "30", "0",
    "11", String(x2),
    "21", String(y2),
    "31", "0"
  ];
}

export function contoursToDxf(contours) {
  const parts = dxfHeader();

  contours.forEach((contour) => {
    for (let i = 0; i < contour.length - 1; i += 1) {
      const [x1, y1] = contour[i];
      const [x2, y2] = contour[i + 1];
      parts.push(...lineEntity(x1, y1, x2, y2));
    }
  });

  parts.push(...dxfFooter());
  return `${parts.join("\n")}\n`;
}

export function svgToDxf(svgText) {
  const contours = parsePolylinesFromSvg(String(svgText || ""));
  return contoursToDxf(contours);
}
