export const DEFAULT_PALLET_CANDIDATES = [
  { id: "gma-48x40", name: "GMA 48 x 40", length: 48, width: 40 },
  { id: "square-42", name: "Square 42 x 42", length: 42, width: 42 },
  { id: "auto-48x45", name: "Automotive 48 x 45", length: 48, width: 45 },
  { id: "square-48", name: "Square 48 x 48", length: 48, width: 48 },
  { id: "large-60x48", name: "Large 60 x 48", length: 60, width: 48 }
];

const EPSILON = 0.000001;

function roundValue(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizeDimension(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeQuantity(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function zoneCount(zone) {
  return Math.max(0, zone.columns) * Math.max(0, zone.rows);
}

function buildPattern(pallet, box, zones, label) {
  const count = zones.reduce((total, zone) => total + zoneCount(zone), 0);
  const usedArea = count * box.length * box.width;
  return {
    label,
    boxesPerLayer: count,
    utilization: pallet.area > 0 ? usedArea / pallet.area : 0,
    zones: zones.filter((zone) => zoneCount(zone) > 0).map((zone) => ({
      x: roundValue(zone.x, 4),
      y: roundValue(zone.y, 4),
      columns: zone.columns,
      rows: zone.rows,
      boxLength: zone.boxLength,
      boxWidth: zone.boxWidth,
      rotated: Boolean(zone.rotated)
    }))
  };
}

function comparePatterns(a, b) {
  if (!a) return b;
  if (b.boxesPerLayer !== a.boxesPerLayer) {
    return b.boxesPerLayer > a.boxesPerLayer ? b : a;
  }
  if (Math.abs(b.utilization - a.utilization) > EPSILON) {
    return b.utilization > a.utilization ? b : a;
  }
  return b.zones.length < a.zones.length ? b : a;
}

function getOrientations(box) {
  return [
    { boxLength: box.length, boxWidth: box.width, rotated: false },
    { boxLength: box.width, boxWidth: box.length, rotated: true }
  ];
}

function sameDirectionPattern(pallet, box, orientation, label) {
  const columns = Math.floor((pallet.length + EPSILON) / orientation.boxLength);
  const rows = Math.floor((pallet.width + EPSILON) / orientation.boxWidth);
  return buildPattern(pallet, box, [
    {
      x: 0,
      y: 0,
      columns,
      rows,
      boxLength: orientation.boxLength,
      boxWidth: orientation.boxWidth,
      rotated: orientation.rotated
    }
  ], label);
}

function splitLengthPattern(pallet, box, first, second, firstColumns) {
  const firstRows = Math.floor((pallet.width + EPSILON) / first.boxWidth);
  const firstLength = firstColumns * first.boxLength;
  const remainingLength = Math.max(0, pallet.length - firstLength);
  const secondColumns = Math.floor((remainingLength + EPSILON) / second.boxLength);
  const secondRows = Math.floor((pallet.width + EPSILON) / second.boxWidth);
  return buildPattern(pallet, box, [
    {
      x: 0,
      y: 0,
      columns: firstColumns,
      rows: firstRows,
      boxLength: first.boxLength,
      boxWidth: first.boxWidth,
      rotated: first.rotated
    },
    {
      x: firstLength,
      y: 0,
      columns: secondColumns,
      rows: secondRows,
      boxLength: second.boxLength,
      boxWidth: second.boxWidth,
      rotated: second.rotated
    }
  ], "split length");
}

function splitWidthPattern(pallet, box, first, second, firstRows) {
  const firstColumns = Math.floor((pallet.length + EPSILON) / first.boxLength);
  const firstWidth = firstRows * first.boxWidth;
  const remainingWidth = Math.max(0, pallet.width - firstWidth);
  const secondColumns = Math.floor((pallet.length + EPSILON) / second.boxLength);
  const secondRows = Math.floor((remainingWidth + EPSILON) / second.boxWidth);
  return buildPattern(pallet, box, [
    {
      x: 0,
      y: 0,
      columns: firstColumns,
      rows: firstRows,
      boxLength: first.boxLength,
      boxWidth: first.boxWidth,
      rotated: first.rotated
    },
    {
      x: 0,
      y: firstWidth,
      columns: secondColumns,
      rows: secondRows,
      boxLength: second.boxLength,
      boxWidth: second.boxWidth,
      rotated: second.rotated
    }
  ], "split width");
}

export function findBestLayerPattern(box, pallet) {
  const orientations = getOrientations(box);
  let best = null;

  orientations.forEach((orientation, index) => {
    best = comparePatterns(best, sameDirectionPattern(pallet, box, orientation, index === 0 ? "straight" : "rotated"));
  });

  orientations.forEach((first, firstIndex) => {
    const second = orientations[1 - firstIndex];
    const maxColumns = Math.floor((pallet.length + EPSILON) / first.boxLength);
    const maxRows = Math.floor((pallet.width + EPSILON) / first.boxWidth);

    for (let columns = 0; columns <= maxColumns; columns += 1) {
      best = comparePatterns(best, splitLengthPattern(pallet, box, first, second, columns));
    }

    for (let rows = 0; rows <= maxRows; rows += 1) {
      best = comparePatterns(best, splitWidthPattern(pallet, box, first, second, rows));
    }
  });

  return best;
}

function makeLayers(boxPlan) {
  const layers = [];
  let remaining = boxPlan.quantity;
  let layerNumber = 1;

  while (remaining > 0) {
    const count = Math.min(remaining, boxPlan.pattern.boxesPerLayer);
    layers.push({
      id: `${boxPlan.box.id}-${layerNumber}`,
      boxId: boxPlan.box.id,
      boxName: boxPlan.box.name,
      count,
      capacity: boxPlan.pattern.boxesPerLayer,
      height: boxPlan.box.height,
      footprintUtilization: boxPlan.pallet.area > 0 ? (count * boxPlan.box.length * boxPlan.box.width) / boxPlan.pallet.area : 0,
      pattern: boxPlan.pattern
    });
    remaining -= count;
    layerNumber += 1;
  }

  return layers;
}

function packLayers(layers, maxStackHeight) {
  const sortedLayers = [...layers].sort((a, b) => {
    if (Math.abs(b.footprintUtilization - a.footprintUtilization) > EPSILON) {
      return b.footprintUtilization - a.footprintUtilization;
    }
    if (Math.abs(b.height - a.height) > EPSILON) {
      return b.height - a.height;
    }
    return a.boxName.localeCompare(b.boxName);
  });

  const pallets = [];

  sortedLayers.forEach((layer) => {
    let bestIndex = -1;
    let bestRemaining = Infinity;

    pallets.forEach((palletStack, index) => {
      const remainingAfter = maxStackHeight - (palletStack.usedHeight + layer.height);
      if (remainingAfter >= -EPSILON && remainingAfter < bestRemaining) {
        bestIndex = index;
        bestRemaining = remainingAfter;
      }
    });

    if (bestIndex < 0) {
      pallets.push({ usedHeight: layer.height, layers: [layer] });
      return;
    }

    pallets[bestIndex].usedHeight += layer.height;
    pallets[bestIndex].layers.push(layer);
  });

  return pallets.map((palletStack, index) => ({
    id: index + 1,
    usedHeight: roundValue(palletStack.usedHeight),
    layers: palletStack.layers.sort((a, b) => {
      if (Math.abs(b.footprintUtilization - a.footprintUtilization) > EPSILON) {
        return b.footprintUtilization - a.footprintUtilization;
      }
      return b.height - a.height;
    })
  }));
}

function evaluatePallet(boxes, pallet, maxStackHeight) {
  const normalizedPallet = {
    ...pallet,
    length: normalizeDimension(pallet.length),
    width: normalizeDimension(pallet.width)
  };
  normalizedPallet.area = normalizedPallet.length * normalizedPallet.width;

  if (!normalizedPallet.length || !normalizedPallet.width || !normalizedPallet.area) {
    return null;
  }

  const boxPlans = [];
  const allLayers = [];

  for (const box of boxes) {
    const pattern = findBestLayerPattern(box, normalizedPallet);
    if (!pattern || pattern.boxesPerLayer <= 0 || box.height > maxStackHeight + EPSILON) {
      return null;
    }

    const boxPlan = {
      box,
      pallet: normalizedPallet,
      quantity: box.quantity,
      pattern,
      layersNeeded: Math.ceil(box.quantity / pattern.boxesPerLayer)
    };
    boxPlans.push(boxPlan);
    allLayers.push(...makeLayers(boxPlan));
  }

  const pallets = packLayers(allLayers, maxStackHeight);
  const totalBoxes = boxes.reduce((total, box) => total + box.quantity, 0);
  const totalBoxVolume = boxes.reduce((total, box) => total + box.length * box.width * box.height * box.quantity, 0);
  const totalPalletVolume = pallets.length * normalizedPallet.area * maxStackHeight;
  const totalLayerHeight = allLayers.reduce((total, layer) => total + layer.height, 0);
  const averageFootprintUtilization = totalLayerHeight > 0
    ? allLayers.reduce((total, layer) => total + layer.footprintUtilization * layer.height, 0) / totalLayerHeight
    : 0;
  const heightUtilization = totalPalletVolume > 0 ? totalBoxVolume / totalPalletVolume : 0;
  const maxHeightUsed = pallets.reduce((max, palletStack) => Math.max(max, palletStack.usedHeight), 0);

  return {
    pallet: normalizedPallet,
    pallets,
    boxPlans,
    totalBoxes,
    maxStackHeight,
    maxHeightUsed: roundValue(maxHeightUsed),
    totalPalletArea: pallets.length * normalizedPallet.area,
    averageFootprintUtilization,
    heightUtilization
  };
}

function comparePlans(a, b) {
  if (a.pallets.length !== b.pallets.length) {
    return a.pallets.length - b.pallets.length;
  }
  if (Math.abs(a.totalPalletArea - b.totalPalletArea) > EPSILON) {
    return a.totalPalletArea - b.totalPalletArea;
  }
  if (Math.abs(b.averageFootprintUtilization - a.averageFootprintUtilization) > EPSILON) {
    return b.averageFootprintUtilization - a.averageFootprintUtilization;
  }
  return b.heightUtilization - a.heightUtilization;
}

export function optimizePalletStack(rawBoxes, options = {}) {
  const maxStackHeight = normalizeDimension(options.maxStackHeight) || 60;
  const palletCandidates = Array.isArray(options.pallets) && options.pallets.length ? options.pallets : DEFAULT_PALLET_CANDIDATES;
  const boxes = rawBoxes
    .map((box, index) => ({
      id: box.id || `box-${index + 1}`,
      name: String(box.name || `Box ${index + 1}`).trim() || `Box ${index + 1}`,
      length: normalizeDimension(box.length),
      width: normalizeDimension(box.width),
      height: normalizeDimension(box.height),
      quantity: normalizeQuantity(box.quantity)
    }))
    .filter((box) => box.length > 0 && box.width > 0 && box.height > 0 && box.quantity > 0);

  if (!boxes.length) {
    return {
      best: null,
      plans: [],
      errors: ["Add at least one box with length, width, height, and quantity."]
    };
  }

  const plans = palletCandidates
    .map((pallet) => evaluatePallet(boxes, pallet, maxStackHeight))
    .filter(Boolean)
    .sort(comparePlans);

  if (!plans.length) {
    return {
      best: null,
      plans: [],
      errors: ["None of the boxes fit the available pallet sizes and stack height."]
    };
  }

  return {
    best: plans[0],
    plans,
    errors: []
  };
}
