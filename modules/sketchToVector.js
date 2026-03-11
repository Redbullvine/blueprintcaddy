import { svgToDxf } from "./svgToDxf.js";

const MAX_WORK_SIZE = 1400;

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
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

async function sourceToCanvas(source) {
  if (source instanceof HTMLCanvasElement) {
    return source;
  }

  if (source instanceof Blob || source instanceof File) {
    const img = await loadImageFromBlob(source);
    const scale = Math.min(1, MAX_WORK_SIZE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  }

  throw new Error("Unsupported sketch source. Expected File, Blob, or Canvas.");
}

function toGrayscale(imageData) {
  const data = imageData.data;
  const gray = new Float32Array(imageData.width * imageData.height);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return gray;
}

function detectEdges(imageData) {
  const { width, height } = imageData;
  const gray = toGrayscale(imageData);
  const edges = new Uint8Array(width * height);
  const threshold = 68;

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
      edges[i] = mag > threshold ? 1 : 0;
    }
  }

  return edges;
}

function traceContours(edgeBitmap, width, height) {
  const visited = new Uint8Array(edgeBitmap.length);
  const contours = [];
  const minPixels = 28;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (!edgeBitmap[idx] || visited[idx]) {
        continue;
      }

      const stack = [idx];
      const pixels = [];
      visited[idx] = 1;

      while (stack.length) {
        const current = stack.pop();
        const cx = current % width;
        const cy = Math.floor(current / width);
        pixels.push([cx, cy]);

        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue;
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) continue;
            const ni = ny * width + nx;
            if (!edgeBitmap[ni] || visited[ni]) continue;
            visited[ni] = 1;
            stack.push(ni);
          }
        }
      }

      if (pixels.length < minPixels) {
        continue;
      }

      pixels.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
      const step = Math.max(1, Math.floor(pixels.length / 90));
      const contour = [];
      for (let i = 0; i < pixels.length; i += step) {
        contour.push(pixels[i]);
      }

      if (contour.length >= 2) {
        contours.push(contour);
      }
    }
  }

  return contours;
}

function contoursToSvg(contours, width, height) {
  const lines = contours
    .map((contour) => {
      const points = contour.map((point) => point.join(",")).join(" ");
      return `<polyline points="${points}" fill="none" stroke="black" stroke-width="1"/>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${lines}\n</svg>`;
}

export async function processSketchImage(source) {
  const canvas = await sourceToCanvas(source);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const edges = detectEdges(imageData);
  const contours = traceContours(edges, canvas.width, canvas.height);
  if (!contours.length) {
    throw new Error("No sketch lines detected. Try a clearer image with darker strokes.");
  }

  const svg = contoursToSvg(contours, canvas.width, canvas.height);
  const dxf = svgToDxf(svg);
  return dxf;
}
