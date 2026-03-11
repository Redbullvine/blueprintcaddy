const DETECT_MAX = 960;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

function drawImageToCanvas(image, maxSize = 0) {
  const maxDim = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const scale = maxSize > 0 ? Math.min(1, maxSize / maxDim) : 1;
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

function grayscale(data) {
  const out = new Float32Array(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    out[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return out;
}

function boxBlur(gray, width, height) {
  const out = new Float32Array(gray.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          sum += gray[(y + oy) * width + (x + ox)];
        }
      }
      out[y * width + x] = sum / 9;
    }
  }
  return out;
}

function edgeMask(gray, width, height, threshold = 45) {
  const out = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const tl = gray[i - width - 1];
      const tc = gray[i - width];
      const tr = gray[i - width + 1];
      const ml = gray[i - 1];
      const mr = gray[i + 1];
      const bl = gray[i + width - 1];
      const bc = gray[i + width];
      const br = gray[i + width + 1];

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = tl + 2 * tc + tr - bl - 2 * bc - br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      out[i] = mag >= threshold ? 1 : 0;
    }
  }
  return out;
}

function largestComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  let best = null;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;

      const stack = [start];
      visited[start] = 1;
      const points = [];

      while (stack.length) {
        const idx = stack.pop();
        const px = idx % width;
        const py = Math.floor(idx / width);
        points.push([px, py]);

        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue;
            const nx = px + ox;
            const ny = py + oy;
            if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) continue;
            const ni = ny * width + nx;
            if (!mask[ni] || visited[ni]) continue;
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }

      if (!best || points.length > best.length) {
        best = points;
      }
    }
  }

  return best;
}

function estimateCorners(points) {
  if (!points || points.length < 120) {
    return null;
  }

  let tl = points[0];
  let tr = points[0];
  let br = points[0];
  let bl = points[0];

  points.forEach((p) => {
    const sum = p[0] + p[1];
    const diff = p[0] - p[1];

    if (sum < tl[0] + tl[1]) tl = p;
    if (sum > br[0] + br[1]) br = p;
    if (diff > tr[0] - tr[1]) tr = p;
    if (diff < bl[0] - bl[1]) bl = p;
  });

  return [tl, tr, br, bl];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function bilinearMap(u, v, corners) {
  const [tl, tr, br, bl] = corners;
  const topX = tl[0] + (tr[0] - tl[0]) * u;
  const topY = tl[1] + (tr[1] - tl[1]) * u;
  const bottomX = bl[0] + (br[0] - bl[0]) * u;
  const bottomY = bl[1] + (br[1] - bl[1]) * u;

  return [
    topX + (bottomX - topX) * v,
    topY + (bottomY - topY) * v
  ];
}

function sampleNearest(srcData, srcWidth, srcHeight, x, y) {
  const ix = Math.max(0, Math.min(srcWidth - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(srcHeight - 1, Math.round(y)));
  const i = (iy * srcWidth + ix) * 4;
  return [srcData[i], srcData[i + 1], srcData[i + 2], srcData[i + 3]];
}

function perspectiveFlatten(sourceCanvas, corners) {
  if (!corners) {
    return sourceCanvas;
  }

  const topW = distance(corners[0], corners[1]);
  const bottomW = distance(corners[3], corners[2]);
  const leftH = distance(corners[0], corners[3]);
  const rightH = distance(corners[1], corners[2]);

  const outW = Math.max(1, Math.round((topW + bottomW) / 2));
  const outH = Math.max(1, Math.round((leftH + rightH) / 2));

  if (outW < 80 || outH < 80) {
    return sourceCanvas;
  }

  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const src = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
  const out = outCtx.createImageData(outW, outH);

  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const u = outW > 1 ? x / (outW - 1) : 0;
      const v = outH > 1 ? y / (outH - 1) : 0;
      const [sx, sy] = bilinearMap(u, v, corners);
      const [r, g, b, a] = sampleNearest(src.data, sourceCanvas.width, sourceCanvas.height, sx, sy);
      const i = (y * outW + x) * 4;
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = a;
    }
  }

  outCtx.putImageData(out, 0, 0);
  return outCanvas;
}

function cleanupBlackAndWhite(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const contrast = (gray - 128) * 1.45 + 128;
    const value = contrast < 164 ? 0 : 255;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  const copy = new Uint8ClampedArray(data);
  const width = canvas.width;
  const height = canvas.height;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      if (copy[i] === 255) continue;

      let darkNeighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          const ni = ((y + oy) * width + (x + ox)) * 4;
          if (copy[ni] === 0) darkNeighbors += 1;
        }
      }

      if (darkNeighbors <= 1) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function scaleCorners(corners, scaleX, scaleY) {
  if (!corners) return null;
  return corners.map((point) => [point[0] * scaleX, point[1] * scaleY]);
}

export async function cleanScannedSketch(file) {
  const image = await loadImage(file);
  const sourceCanvas = drawImageToCanvas(image);
  const detectCanvas = drawImageToCanvas(image, DETECT_MAX);

  const detectCtx = detectCanvas.getContext("2d", { willReadFrequently: true });
  const detectImage = detectCtx.getImageData(0, 0, detectCanvas.width, detectCanvas.height);
  const gray = grayscale(detectImage.data);
  const blurred = boxBlur(gray, detectCanvas.width, detectCanvas.height);
  const edges = edgeMask(blurred, detectCanvas.width, detectCanvas.height);
  const component = largestComponent(edges, detectCanvas.width, detectCanvas.height);
  const detectedCorners = estimateCorners(component);

  const scaleX = sourceCanvas.width / detectCanvas.width;
  const scaleY = sourceCanvas.height / detectCanvas.height;
  const fullCorners = scaleCorners(detectedCorners, scaleX, scaleY);

  const flattened = perspectiveFlatten(sourceCanvas, fullCorners);
  return cleanupBlackAndWhite(flattened);
}
