const pngFile = document.getElementById("pngFile");
const traceMode = document.getElementById("traceMode");
const numColors = document.getElementById("numColors");

const threshold = document.getElementById("threshold");
const invert = document.getElementById("invert");
const despeckle = document.getElementById("despeckle");
const pathomit = document.getElementById("pathomit");
const ltres = document.getElementById("ltres");
const qtres = document.getElementById("qtres");

const sampleStep = document.getElementById("sampleStep");
const exportScale = document.getElementById("exportScale");
const exportName = document.getElementById("exportName");

const thresholdValue = document.getElementById("thresholdValue");
const pathomitValue = document.getElementById("pathomitValue");
const ltresValue = document.getElementById("ltresValue");
const qtresValue = document.getElementById("qtresValue");

const traceBtn = document.getElementById("traceBtn");
const downloadSvgBtn = document.getElementById("downloadSvgBtn");
const downloadDxfBtn = document.getElementById("downloadDxfBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("status");

const previewCanvas = document.getElementById("previewCanvas");
const ctx = previewCanvas.getContext("2d");
const svgPreview = document.getElementById("svgPreview");

let originalImage = null;
let originalImageData = null;
let processedImageData = null;
let tracedSvgString = "";

function setStatus(message) {
  statusBox.textContent = message;
}

function updateValueLabels() {
  thresholdValue.textContent = threshold.value;
  pathomitValue.textContent = pathomit.value;
  ltresValue.textContent = ltres.value;
  qtresValue.textContent = qtres.value;
}

function setDefaultCanvas() {
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
}

function getBaseName(filename) {
  if (!filename) return "norrisdxf-output";
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(0, index) : filename;
}

function sanitizeFileName(name) {
  const cleaned = (name || "norrisdxf-output").trim().replace(/[^\w\-]+/g, "-");
  return cleaned || "norrisdxf-output";
}

function fitImageToCanvas(img, canvas) {
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.min(cw / img.width, ch / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const x = (cw - drawW) / 2;
  const y = (ch - drawH) / 2;

  setDefaultCanvas();
  ctx.drawImage(img, x, y, drawW, drawH);

  return { x, y, drawW, drawH };
}

function captureOriginalImageData() {
  if (!originalImage) return;
  fitImageToCanvas(originalImage, previewCanvas);
  originalImageData = ctx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
}

function applyThresholdPreview() {
  if (!originalImage) return;

  fitImageToCanvas(originalImage, previewCanvas);

  const imageData = ctx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
  const data = imageData.data;
  const t = Number(threshold.value);
  const invertOn = invert.checked;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];

    if (alpha === 0) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    let value = gray >= t ? 255 : 0;
    if (invertOn) value = 255 - value;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  if (despeckle.checked) {
    despeckleBinary(imageData, 1);
  }

  ctx.putImageData(imageData, 0, 0);
  processedImageData = ctx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
}

function showOriginalPreview() {
  if (!originalImage) return;
  fitImageToCanvas(originalImage, previewCanvas);
}

function despeckleBinary(imageData, passes = 1) {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  for (let pass = 0; pass < passes; pass++) {
    const copy = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const center = copy[idx];

        let blackNeighbors = 0;
        let whiteNeighbors = 0;

        for (let yy = -1; yy <= 1; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            if (xx === 0 && yy === 0) continue;
            const ni = ((y + yy) * width + (x + xx)) * 4;
            if (copy[ni] === 0) blackNeighbors++;
            else whiteNeighbors++;
          }
        }

        if (center === 0 && whiteNeighbors >= 7) {
          data[idx] = data[idx + 1] = data[idx + 2] = 255;
        }

        if (center === 255 && blackNeighbors >= 7) {
          data[idx] = data[idx + 1] = data[idx + 2] = 0;
        }
      }
    }
  }
}

function countSvgPaths(svgString) {
  try {
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    return doc.querySelectorAll("path").length;
  } catch (error) {
    return 0;
  }
}

function buildTraceOptions(isColorMode) {
  return {
    ltres: Number(ltres.value),
    qtres: Number(qtres.value),
    pathomit: Number(pathomit.value),
    rightangleenhance: true,
    colorsampling: isColorMode ? 2 : 0,
    numberofcolors: isColorMode ? Math.max(2, Math.min(16, Number(numColors.value) || 6)) : 2,
    linefilter: true,
    roundcoords: 2,
    strokewidth: 1,
    viewbox: true,
    desc: false,
    scale: 1,
    lcpr: 0,
    qcpr: 0,
    blurradius: 0,
    blurdelta: 20
  };
}

function traceCurrentImage() {
  if (!originalImage) {
    setStatus("Load a PNG first.");
    return;
  }

  try {
    const isColorMode = traceMode.value === "color";
    let sourceImageData;

    if (isColorMode) {
      captureOriginalImageData();
      showOriginalPreview();
      sourceImageData = originalImageData;
    } else {
      applyThresholdPreview();
      sourceImageData = processedImageData;
    }

    const options = buildTraceOptions(isColorMode);
    tracedSvgString = ImageTracer.imagedataToSVG(sourceImageData, options);

    svgPreview.classList.remove("empty");
    svgPreview.innerHTML = tracedSvgString;

    downloadSvgBtn.disabled = false;
    downloadDxfBtn.disabled = false;

    const pathCount = countSvgPaths(tracedSvgString);
    setStatus(`Trace complete. ${pathCount} path(s) created using ${isColorMode ? "Color" : "Binary"} Trace.`);
  } catch (error) {
    console.error(error);
    setStatus("Trace failed. Try different settings.");
  }
}

function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function dedupePoints(points, tolerance = 0.01) {
  if (!points.length) return points;
  const clean = [points[0]];

  for (let i = 1; i < points.length; i++) {
    if (distance(points[i], clean[clean.length - 1]) > tolerance) {
      clean.push(points[i]);
    }
  }

  return clean;
}

function pathIsClosed(pathEl) {
  const d = pathEl.getAttribute("d") || "";
  return /z\s*$/i.test(d.trim());
}

function sampleSvgPaths(svgString, pxStep = 3) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svgEl = doc.querySelector("svg");

  if (!svgEl) {
    throw new Error("No SVG found.");
  }

  const viewBox = (svgEl.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
  let vbX = 0;
  let vbY = 0;
  let vbW = 1000;
  let vbH = 1000;

  if (viewBox.length === 4 && viewBox.every(Number.isFinite)) {
    [vbX, vbY, vbW, vbH] = viewBox;
  }

  const hiddenWrap = document.createElement("div");
  hiddenWrap.style.position = "absolute";
  hiddenWrap.style.left = "-99999px";
  hiddenWrap.style.top = "-99999px";
  hiddenWrap.style.width = "0";
  hiddenWrap.style.height = "0";
  hiddenWrap.innerHTML = svgString;
  document.body.appendChild(hiddenWrap);

  const liveSvg = hiddenWrap.querySelector("svg");
  const pathEls = [...liveSvg.querySelectorAll("path")];

  if (!pathEls.length) {
    hiddenWrap.remove();
    throw new Error("No SVG paths found.");
  }

  const polylines = [];

  for (const pathEl of pathEls) {
    let totalLength = 0;

    try {
      totalLength = pathEl.getTotalLength();
    } catch (err) {
      continue;
    }

    if (!Number.isFinite(totalLength) || totalLength <= 0) continue;

    const step = Math.max(0.5, pxStep);
    const divisions = Math.max(8, Math.ceil(totalLength / step));
    const pts = [];

    for (let i = 0; i <= divisions; i++) {
      const len = (i / divisions) * totalLength;
      const p = pathEl.getPointAtLength(len);
      pts.push({ x: p.x, y: p.y });
    }

    let cleanPts = dedupePoints(pts, 0.05);

    const closed = pathIsClosed(pathEl);
    if (closed && cleanPts.length > 2) {
      const first = cleanPts[0];
      const last = cleanPts[cleanPts.length - 1];
      if (distance(first, last) > 0.1) {
        cleanPts.push({ x: first.x, y: first.y });
      }
    }

    if (cleanPts.length >= 2) {
      polylines.push({
        closed,
        points: cleanPts
      });
    }
  }

  hiddenWrap.remove();

  if (!polylines.length) {
    throw new Error("No usable polylines were created.");
  }

  return {
    polylines,
    viewBox: { x: vbX, y: vbY, width: vbW, height: vbH }
  };
}

function normalizePolylinesForDxf(polylines, vbHeight, scaleFactor) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const converted = polylines.map(poly => {
    const pts = poly.points.map(p => {
      const x = p.x * scaleFactor;
      const y = (vbHeight - p.y) * scaleFactor;
      return { x, y };
    });

    for (const pt of pts) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    return {
      closed: poly.closed,
      points: pts
    };
  });

  const shifted = converted.map(poly => ({
    closed: poly.closed,
    points: poly.points.map(p => ({
      x: p.x - minX,
      y: p.y - minY
    }))
  }));

  return {
    polylines: shifted,
    bounds: {
      minX: 0,
      minY: 0,
      maxX: maxX - minX,
      maxY: maxY - minY
    }
  };
}

function formatNumber(n) {
  return Number(n).toFixed(4);
}

function polylineToDxf(poly) {
  const lines = [];
  lines.push("0");
  lines.push("LWPOLYLINE");
  lines.push("8");
  lines.push("0");
  lines.push("90");
  lines.push(String(poly.points.length));
  lines.push("70");
  lines.push(poly.closed ? "1" : "0");

  for (const pt of poly.points) {
    lines.push("10");
    lines.push(formatNumber(pt.x));
    lines.push("20");
    lines.push(formatNumber(pt.y));
  }

  return lines.join("\n");
}

function buildDxf(polylines) {
  const sections = [];
  sections.push("0");
  sections.push("SECTION");
  sections.push("2");
  sections.push("HEADER");
  sections.push("0");
  sections.push("ENDSEC");
  sections.push("0");
  sections.push("SECTION");
  sections.push("2");
  sections.push("ENTITIES");

  for (const poly of polylines) {
    sections.push(polylineToDxf(poly));
  }

  sections.push("0");
  sections.push("ENDSEC");
  sections.push("0");
  sections.push("EOF");

  return sections.join("\n");
}

function exportSvg() {
  if (!tracedSvgString) {
    setStatus("No SVG available.");
    return;
  }

  const name = sanitizeFileName(exportName.value);
  downloadTextFile(tracedSvgString, `${name}.svg`, "image/svg+xml");
  setStatus("SVG downloaded.");
}

function exportDxf() {
  if (!tracedSvgString) {
    setStatus("No trace available for DXF export.");
    return;
  }

  const scaleFactor = Number(exportScale.value);
  const step = Number(sampleStep.value);

  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    setStatus("DXF scale must be greater than 0.");
    return;
  }

  if (!Number.isFinite(step) || step <= 0) {
    setStatus("Polyline sample step must be greater than 0.");
    return;
  }

  try {
    const sampled = sampleSvgPaths(tracedSvgString, step);
    const normalized = normalizePolylinesForDxf(sampled.polylines, sampled.viewBox.height, scaleFactor);
    const dxf = buildDxf(normalized.polylines);

    const name = sanitizeFileName(exportName.value);
    downloadTextFile(dxf, `${name}.dxf`, "application/dxf");

    setStatus(`DXF downloaded. ${normalized.polylines.length} polylines exported.`);
  } catch (error) {
    console.error(error);
    setStatus("DXF export failed. Try Color Trace, reduce sample step, or simplify the trace.");
  }
}

function clearAll() {
  originalImage = null;
  originalImageData = null;
  processedImageData = null;
  tracedSvgString = "";

  pngFile.value = "";
  exportName.value = "norrisdxf-output";

  setDefaultCanvas();
  svgPreview.classList.add("empty");
  svgPreview.textContent = "No trace yet.";

  downloadSvgBtn.disabled = true;
  downloadDxfBtn.disabled = true;

  setStatus("Load a PNG to begin.");
}

function refreshPreviewByMode() {
  if (!originalImage) return;
  if (traceMode.value === "binary") {
    applyThresholdPreview();
  } else {
    showOriginalPreview();
  }
}

pngFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  exportName.value = getBaseName(file.name);

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      captureOriginalImageData();
      refreshPreviewByMode();

      tracedSvgString = "";
      svgPreview.classList.add("empty");
      svgPreview.textContent = "No trace yet.";
      downloadSvgBtn.disabled = true;
      downloadDxfBtn.disabled = true;

      setStatus(`Loaded ${file.name}. Use Color Trace for multi-color transparent logos.`);
    };
    img.src = e.target.result;
  };

  reader.readAsDataURL(file);
});

[threshold, invert, despeckle, pathomit, ltres, qtres].forEach((el) => {
  el.addEventListener("input", () => {
    updateValueLabels();
    if (traceMode.value === "binary" && originalImage) {
      applyThresholdPreview();
    }
  });
});

traceMode.addEventListener("change", () => {
  refreshPreviewByMode();
});

traceBtn.addEventListener("click", traceCurrentImage);
downloadSvgBtn.addEventListener("click", exportSvg);
downloadDxfBtn.addEventListener("click", exportDxf);
clearBtn.addEventListener("click", clearAll);

updateValueLabels();
clearAll();
