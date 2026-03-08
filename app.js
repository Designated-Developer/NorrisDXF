const pngFile = document.getElementById("pngFile");
const threshold = document.getElementById("threshold");
const invert = document.getElementById("invert");
const despeckle = document.getElementById("despeckle");
const pathomit = document.getElementById("pathomit");
const ltres = document.getElementById("ltres");
const qtres = document.getElementById("qtres");
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
let processedImageData = null;
let tracedSvgString = "";

function setStatus(message) {
  statusBox.textContent = message;
}

function setDefaultCanvas() {
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
}

function updateValueLabels() {
  thresholdValue.textContent = threshold.value;
  pathomitValue.textContent = pathomit.value;
  ltresValue.textContent = ltres.value;
  qtresValue.textContent = qtres.value;
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

function applyThresholdPreview() {
  if (!originalImage) return;

  fitImageToCanvas(originalImage, previewCanvas);

  const imageData = ctx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);
  const data = imageData.data;
  const t = Number(threshold.value);
  const invertOn = invert.checked;

  for (let i = 0; i < data.length; i += 4) {
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

function traceCurrentImage() {
  if (!processedImageData) {
    setStatus("Load a PNG first.");
    return;
  }

  try {
    const options = {
      ltres: Number(ltres.value),
      qtres: Number(qtres.value),
      pathomit: Number(pathomit.value),
      rightangleenhance: true,
      colorsampling: 0,
      numberofcolors: 2,
      strokewidth: 1,
      linefilter: true,
      roundcoords: 2,
      viewbox: true,
      lcpr: 0,
      qcpr: 0,
      scale: 1,
      desc: false
    };

    tracedSvgString = ImageTracer.imagedataToSVG(processedImageData, options);
    svgPreview.classList.remove("empty");
    svgPreview.innerHTML = tracedSvgString;

    downloadSvgBtn.disabled = false;
    downloadDxfBtn.disabled = false;

    const pathCount = countSvgPaths(tracedSvgString);
    setStatus(`Trace complete. ${pathCount} path(s) created.`);
  } catch (error) {
    console.error(error);
    setStatus("Trace failed. Try a cleaner image or different settings.");
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

function svgToDxf(svgString, scaleFactor = 1) {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const pathEls = [...doc.querySelectorAll("path")];

  if (!pathEls.length) {
    throw new Error("No SVG paths found.");
  }

  const model = { models: {} };
  let validCount = 0;

  pathEls.forEach((pathEl, index) => {
    const d = pathEl.getAttribute("d");
    if (!d || !d.trim()) return;

    try {
      const importedModel = makerjs.importer.fromSVGPathData(d);
      if (importedModel) {
        model.models[`path_${index}`] = importedModel;
        validCount++;
      }
    } catch (error) {
      console.warn("Skipped bad SVG path:", error);
    }
  });

  if (!validCount) {
    throw new Error("No valid paths could be converted to DXF.");
  }

  if (scaleFactor !== 1) {
    makerjs.model.scale(model, scaleFactor);
  }

  return makerjs.exporter.toDXF(model);
}

function clearAll() {
  originalImage = null;
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

pngFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  exportName.value = getBaseName(file.name);

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      applyThresholdPreview();

      tracedSvgString = "";
      svgPreview.classList.add("empty");
      svgPreview.textContent = "No trace yet.";
      downloadSvgBtn.disabled = true;
      downloadDxfBtn.disabled = true;

      setStatus(`Loaded ${file.name}. Adjust settings or click Trace PNG.`);
    };
    img.src = e.target.result;
  };

  reader.readAsDataURL(file);
});

[threshold, invert, despeckle, pathomit, ltres, qtres].forEach((el) => {
  el.addEventListener("input", () => {
    updateValueLabels();
    if (originalImage) {
      applyThresholdPreview();
    }
  });
});

traceBtn.addEventListener("click", () => {
  traceCurrentImage();
});

downloadSvgBtn.addEventListener("click", () => {
  if (!tracedSvgString) {
    setStatus("No SVG available.");
    return;
  }

  const name = sanitizeFileName(exportName.value);
  downloadTextFile(tracedSvgString, `${name}.svg`, "image/svg+xml");
  setStatus("SVG downloaded.");
});

downloadDxfBtn.addEventListener("click", () => {
  if (!tracedSvgString) {
    setStatus("No trace available for DXF export.");
    return;
  }

  const scaleFactor = Number(exportScale.value);
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    setStatus("DXF scale must be greater than 0.");
    return;
  }

  try {
    const dxf = svgToDxf(tracedSvgString, scaleFactor);
    const name = sanitizeFileName(exportName.value);
    downloadTextFile(dxf, `${name}.dxf`, "application/dxf");
    setStatus("DXF downloaded.");
  } catch (error) {
    console.error(error);
    setStatus("DXF export failed. Try a cleaner image or stronger simplification.");
  }
});

clearBtn.addEventListener("click", clearAll);

updateValueLabels();
clearAll();
