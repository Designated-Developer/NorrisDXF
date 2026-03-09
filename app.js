const pngFile = document.getElementById("pngFile");
const traceMode = document.getElementById("traceMode");
const numColors = document.getElementById("numColors");

const threshold = document.getElementById("threshold");
const invert = document.getElementById("invert");
const despeckle = document.getElementById("despeckle");
const pathomit = document.getElementById("pathomit");
const ltres = document.getElementById("ltres");
const qtres = document.getElementById("qtres");

const removeLightBg = document.getElementById("removeLightBg");
const removeSmallJunk = document.getElementById("removeSmallJunk");
const preferLogoShapes = document.getElementById("preferLogoShapes");
const detectInteriorHoles = document.getElementById("detectInteriorHoles");
const lightBgThreshold = document.getElementById("lightBgThreshold");

const sampleStep = document.getElementById("sampleStep");
const exportScale = document.getElementById("exportScale");
const exportName = document.getElementById("exportName");

const thresholdValue = document.getElementById("thresholdValue");
const pathomitValue = document.getElementById("pathomitValue");
const ltresValue = document.getElementById("ltresValue");
const qtresValue = document.getElementById("qtresValue");
const lightBgThresholdValue = document.getElementById("lightBgThresholdValue");

const traceBtn = document.getElementById("traceBtn");
const downloadDxfBtn = document.getElementById("downloadDxfBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("status");

const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");

const previewCanvas = document.getElementById("previewCanvas");
const previewCtx = previewCanvas.getContext("2d");

const dxfPreviewCanvas = document.getElementById("dxfPreviewCanvas");
const dxfCtx = dxfPreviewCanvas.getContext("2d");

let originalImage = null;
let tracedSvgString = "";
let currentDxfPolylines = [];

function setStatus(message) {
  statusBox.textContent = message;
}

function showLoading(message) {
  loadingText.textContent = message || "Processing image.";
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

function updateValueLabels() {
  thresholdValue.textContent = threshold.value;
  pathomitValue.textContent = pathomit.value;
  ltresValue.textContent = ltres.value;
  qtresValue.textContent = qtres.value;
  lightBgThresholdValue.textContent = lightBgThreshold.value;
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function setDefaultPreviewCanvas() {
  clearCanvas(previewCtx, previewCanvas);
}

function setDefaultDxfCanvas() {
  clearCanvas(dxfCtx, dxfPreviewCanvas);
  dxfCtx.fillStyle = "#6b7280";
  dxfCtx.font = "24px Arial";
  dxfCtx.textAlign = "center";
  dxfCtx.textBaseline = "middle";
  dxfCtx.fillText("No DXF preview yet.", dxfPreviewCanvas.width / 2, dxfPreviewCanvas.height / 2);
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

function fitImageToCanvas(img, canvas, ctx) {
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.min(cw / img.width, ch / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const x = (cw - drawW) / 2;
  const y = (ch - drawH) / 2;

  clearCanvas(ctx, canvas);
  ctx.drawImage(img, x, y, drawW, drawH);
}

function removeLightBackgroundFromImageData(imageData, thresholdValueNum = 225) {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 0;
      continue;
    }

    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = maxCh - minCh;

    const isVeryLight = brightness >= thresholdValueNum;
    const isLowSaturationLight = brightness >= (thresholdValueNum - 12) && saturation <= 20;

    if (isVeryLight || isLowSaturationLight) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 0;
    }
  }
}

function cropImageDataToVisibleBounds(imageData, alphaCutoff = 10) {
  const { width, height, data } = imageData;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];

      if (a > alphaCutoff) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return imageData;
  }

  const pad = 3;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = cropW;
  tempCanvas.height = cropH;
  const tctx = tempCanvas.getContext("2d");
  const cropped = tctx.createImageData(cropW, cropH);

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcI = ((y + minY) * width + (x + minX)) * 4;
      const dstI = (y * cropW + x) * 4;

      cropped.data[dstI] = data[srcI];
      cropped.data[dstI + 1] = data[srcI + 1];
      cropped.data[dstI + 2] = data[srcI + 2];
      cropped.data[dstI + 3] = data[srcI + 3];
    }
  }

  return cropped;
}

function drawImageDataToPreview(imageData) {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  const tctx = tempCanvas.getContext("2d");
  tctx.putImageData(imageData, 0, 0);

  clearCanvas(previewCtx, previewCanvas);

  const scale = Math.min(
    previewCanvas.width / imageData.width,
    previewCanvas.height / imageData.height
  );

  const drawW = imageData.width * scale;
  const drawH = imageData.height * scale;
  const x = (previewCanvas.width - drawW) / 2;
  const y = (previewCanvas.height - drawH) / 2;

  previewCtx.drawImage(tempCanvas, x, y, drawW, drawH);
}

function buildBaseImageData() {
  if (!originalImage) throw new Error("No image loaded.");

  fitImageToCanvas(originalImage, previewCanvas, previewCtx);
  let imgData = previewCtx.getImageData(0, 0, previewCanvas.width, previewCanvas.height);

  if (removeLightBg.checked) {
    removeLightBackgroundFromImageData(imgData, Number(lightBgThreshold.value));
  }

  imgData = cropImageDataToVisibleBounds(imgData, 10);
  return imgData;
}

function buildBinaryImageData(baseImageData, thresholdValueNum, invertOn, despeckleOn) {
  const imageData = new ImageData(
    new Uint8ClampedArray(baseImageData.data),
    baseImageData.width,
    baseImageData.height
  );

  const data = imageData.data;

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

    let value = gray >= thresholdValueNum ? 255 : 0;
    if (invertOn) value = 255 - value;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  if (despeckleOn) {
    despeckleBinary(imageData, 1);
  }

  return imageData;
}

function showCurrentImagePreview() {
  if (!originalImage) return;

  const base = buildBaseImageData();

  if (traceMode.value === "binary" || traceMode.value === "logo") {
    const binary = buildBinaryImageData(
      base,
      Number(threshold.value),
      invert.checked,
      despeckle.checked
    );
    drawImageDataToPreview(binary);
  } else {
    drawImageDataToPreview(base);
  }
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

function getPolylineBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function getAllPolylinesBounds(polylines) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const poly of polylines) {
    for (const p of poly.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function polylineArea(points) {
  let area = 0;
  const n = points.length;
  if (n < 3) return 0;

  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    area += (p1.x * p2.y) - (p2.x * p1.y);
  }
  return Math.abs(area / 2);
}

function polygonCentroid(points) {
  const n = points.length;
  if (!n) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;

  for (const p of points) {
    x += p.x;
    y += p.y;
  }

  return { x: x / n, y: y / n };
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

function polylineMatchesOuterBounds(poly, allBounds, tolerance = 2) {
  if (!poly || !poly.points || poly.points.length < 4) return false;

  const b = getPolylineBounds(poly.points);

  const touchesLeft = Math.abs(b.minX - allBounds.minX) <= tolerance;
  const touchesRight = Math.abs(b.maxX - allBounds.maxX) <= tolerance;
  const touchesBottom = Math.abs(b.minY - allBounds.minY) <= tolerance;
  const touchesTop = Math.abs(b.maxY - allBounds.maxY) <= tolerance;

  const widthClose = Math.abs(b.width - allBounds.width) <= tolerance * 2;
  const heightClose = Math.abs(b.height - allBounds.height) <= tolerance * 2;

  return touchesLeft && touchesRight && touchesBottom && touchesTop && widthClose && heightClose;
}

function removeOuterBorderPolyline(polylines) {
  if (!polylines || polylines.length < 2) return polylines;

  const allBounds = getAllPolylinesBounds(polylines);

  return polylines.filter((poly) => {
    const b = getPolylineBounds(poly.points);

    const hugeEnough =
      b.width >= allBounds.width * 0.95 &&
      b.height >= allBounds.height * 0.95;

    if (!hugeEnough) return true;

    const isBorder = polylineMatchesOuterBounds(poly, allBounds, 2);
    return !isBorder;
  });
}

function shouldKeepPolyline(points, minLength = 2, minSize = 1) {
  if (!points || points.length < 2) return false;

  const bounds = getPolylineBounds(points);
  const widthOk = bounds.width >= minSize;
  const heightOk = bounds.height >= minSize;

  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    totalLen += distance(points[i], points[i - 1]);
  }

  return totalLen >= minLength && (widthOk || heightOk);
}

function splitPathDataIntoSubpaths(d) {
  if (!d || !d.trim()) return [];
  const matches = d.match(/[Mm][^Mm]*/g);
  return matches ? matches.map((s) => s.trim()).filter(Boolean) : [d.trim()];
}

function sampleSvgPaths(svgString, pxStep = 3) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svgEl = doc.querySelector("svg");

  if (!svgEl) {
    throw new Error("No SVG found.");
  }

  const viewBox = (svgEl.getAttribute("viewBox") || "")
    .trim()
    .split(/\s+/)
    .map(Number);

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
  hiddenWrap.style.opacity = "0";
  hiddenWrap.style.pointerEvents = "none";
  hiddenWrap.innerHTML = svgString;
  document.body.appendChild(hiddenWrap);

  const liveSvg = hiddenWrap.querySelector("svg");
  const pathEls = [...liveSvg.querySelectorAll("path")];

  if (!pathEls.length) {
    hiddenWrap.remove();
    throw new Error("No SVG paths found.");
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const polylines = [];

  for (const pathEl of pathEls) {
    const d = pathEl.getAttribute("d");
    if (!d || !d.trim()) continue;

    const subpaths = splitPathDataIntoSubpaths(d);

    for (const subD of subpaths) {
      const tempPath = document.createElementNS(svgNS, "path");
      tempPath.setAttribute("d", subD);
      liveSvg.appendChild(tempPath);

      let totalLength = 0;
      try {
        totalLength = tempPath.getTotalLength();
      } catch (err) {
        tempPath.remove();
        continue;
      }

      if (!Number.isFinite(totalLength) || totalLength <= 0) {
        tempPath.remove();
        continue;
      }

      const step = Math.max(0.5, pxStep);
      const divisions = Math.max(8, Math.ceil(totalLength / step));
      const pts = [];

      for (let i = 0; i <= divisions; i++) {
        const len = (i / divisions) * totalLength;
        const p = tempPath.getPointAtLength(len);
        pts.push({ x: p.x, y: p.y });
      }

      tempPath.remove();

      let cleanPts = dedupePoints(pts, 0.05);
      const closed = /z\s*$/i.test(subD.trim());

      if (closed && cleanPts.length > 2) {
        const first = cleanPts[0];
        const last = cleanPts[cleanPts.length - 1];
        if (distance(first, last) > 0.1) {
          cleanPts.push({ x: first.x, y: first.y });
        }
      }

      if (!shouldKeepPolyline(cleanPts, 2, 1)) continue;

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

function annotateNesting(polylines) {
  const annotated = polylines.map((poly, index) => ({
    ...poly,
    _index: index,
    _bounds: getPolylineBounds(poly.points),
    _area: polylineArea(poly.points),
    _centroid: polygonCentroid(poly.points),
    _parentCount: 0,
    _isNested: false
  }));

  if (!detectInteriorHoles.checked) return annotated;

  for (let i = 0; i < annotated.length; i++) {
    for (let j = 0; j < annotated.length; j++) {
      if (i === j) continue;

      const a = annotated[i];
      const b = annotated[j];

      if (!b.closed || !a.closed) continue;
      if (b._area <= a._area) continue;

      const inside = pointInPolygon(a._centroid, b.points);
      if (inside) {
        a._parentCount += 1;
      }
    }
  }

  for (const poly of annotated) {
    poly._isNested = poly._parentCount > 0;
  }

  return annotated;
}

function removeTinyJunkPolylines(polylines) {
  if (!removeSmallJunk.checked || !polylines.length) return polylines;

  const allBounds = getAllPolylinesBounds(polylines);
  const minW = Math.max(2.2, allBounds.width * 0.008);
  const minH = Math.max(2.2, allBounds.height * 0.008);
  const minArea = Math.max(10, (allBounds.width * allBounds.height) * 0.00004);

  return polylines.filter(poly => {
    if (poly._isNested) return true;

    const b = poly._bounds || getPolylineBounds(poly.points);
    const area = poly._area || (b.width * b.height);

    const tinyBox = b.width < minW && b.height < minH;
    const tinyArea = area < minArea;

    return !(tinyBox || tinyArea);
  });
}

function removeLikelyCornerCopyright(polylines) {
  if (!removeSmallJunk.checked || !polylines.length) return polylines;

  const allBounds = getAllPolylinesBounds(polylines);
  const rightZone = allBounds.minX + allBounds.width * 0.82;
  const bottomZone = allBounds.minY + allBounds.height * 0.82;

  return polylines.filter(poly => {
    if (poly._isNested) return true;

    const b = poly._bounds || getPolylineBounds(poly.points);
    const small = b.width < allBounds.width * 0.14 && b.height < allBounds.height * 0.08;
    const inCorner = b.minX >= rightZone && b.minY >= bottomZone;
    return !(small && inCorner);
  });
}

function keepLargestMeaningfulShapes(polylines) {
  if (!preferLogoShapes.checked || polylines.length < 10) return polylines;

  const nestedCount = polylines.filter(p => p._isNested).length;
  if (nestedCount > 0) return polylines;

  const ranked = polylines.map(poly => {
    const b = poly._bounds || getPolylineBounds(poly.points);
    return {
      poly,
      score: (b.width * b.height) + poly.points.length * 0.7
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  const keepCount = Math.min(Math.max(8, Math.floor(ranked.length * 0.78)), ranked.length);
  const kept = ranked.slice(0, keepCount).map(item => item.poly);

  return kept.length ? kept : polylines;
}

function cleanupPolylines(polylines) {
  let out = polylines.slice();
  out = removeOuterBorderPolyline(out);
  out = annotateNesting(out);
  out = removeTinyJunkPolylines(out);
  out = removeLikelyCornerCopyright(out);
  out = keepLargestMeaningfulShapes(out);

  return out.map(({ _index, _bounds, _area, _centroid, _parentCount, _isNested, ...rest }) => rest);
}

function normalizePolylinesForDxf(polylines, vbHeight, scaleFactor) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const converted = polylines.map((poly) => {
    const pts = poly.points.map((p) => {
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

  const shifted = converted.map((poly) => ({
    closed: poly.closed,
    points: poly.points.map((p) => ({
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

function drawDxfPreview(polylines) {
  clearCanvas(dxfCtx, dxfPreviewCanvas);

  if (!polylines || !polylines.length) {
    setDefaultDxfCanvas();
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const poly of polylines) {
    for (const pt of poly.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padding = 60;

  const scale = Math.min(
    (dxfPreviewCanvas.width - padding * 2) / width,
    (dxfPreviewCanvas.height - padding * 2) / height
  );

  const offsetX = (dxfPreviewCanvas.width - width * scale) / 2;
  const offsetY = (dxfPreviewCanvas.height - height * scale) / 2;

  dxfCtx.strokeStyle = "#111827";
  dxfCtx.lineWidth = 1.8;
  dxfCtx.lineJoin = "round";
  dxfCtx.lineCap = "round";

  for (const poly of polylines) {
    if (!poly.points || poly.points.length < 2) continue;

    dxfCtx.beginPath();

    poly.points.forEach((pt, index) => {
      const x = offsetX + (pt.x - minX) * scale;
      const y = dxfPreviewCanvas.height - (offsetY + (pt.y - minY) * scale);

      if (index === 0) dxfCtx.moveTo(x, y);
      else dxfCtx.lineTo(x, y);
    });

    if (poly.closed) dxfCtx.closePath();
    dxfCtx.stroke();
  }
}

function makeTraceOptions(preset) {
  return {
    ltres: preset.ltres,
    qtres: preset.qtres,
    pathomit: preset.pathomit,
    rightangleenhance: true,
    colorsampling: preset.mode === "color" ? 2 : 0,
    numberofcolors: preset.mode === "color" ? preset.colors : 2,
    linefilter: false,
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

function scoreTraceResult(normalizedPolylines) {
  if (!normalizedPolylines.length) return -999999;

  let totalPoints = 0;
  let closedCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const poly of normalizedPolylines) {
    totalPoints += poly.points.length;
    if (poly.closed) closedCount++;

    for (const pt of poly.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const area = width * height;
  const polyCount = normalizedPolylines.length;

  let score = 0;
  score += Math.min(area / 500, 300);
  score += Math.min(closedCount * 10, 160);

  if (polyCount >= 2 && polyCount <= 80) score += 120;
  else if (polyCount <= 150) score += 40;
  else score -= Math.min(polyCount, 280);

  if (totalPoints < 9000) score += 100;
  else score -= Math.min((totalPoints - 9000) / 20, 320);

  if (width > 40 && height > 40) score += 80;
  if (width < 10 || height < 10) score -= 120;

  return score;
}

function buildAutoPresets() {
  const step = Number(sampleStep.value) || 2.5;

  if (traceMode.value === "logo") {
    return [
      { label: "Logo Binary 145 / omit 8", mode: "binary", threshold: 145, invert: false, despeckle: true, pathomit: 8, ltres: 1.6, qtres: 1.6, sampleStep: step },
      { label: "Logo Binary 155 / omit 10", mode: "binary", threshold: 155, invert: false, despeckle: true, pathomit: 10, ltres: 1.8, qtres: 1.8, sampleStep: step },
      { label: "Logo Binary 135 / omit 6", mode: "binary", threshold: 135, invert: false, despeckle: true, pathomit: 6, ltres: 1.5, qtres: 1.5, sampleStep: step }
    ];
  }

  return [
    { label: "Color 4 / omit 12", mode: "color", colors: 4, pathomit: 12, ltres: 2.0, qtres: 2.0, sampleStep: step },
    { label: "Color 3 / omit 14", mode: "color", colors: 3, pathomit: 14, ltres: 2.2, qtres: 2.2, sampleStep: step },
    { label: "Binary 145 / omit 10", mode: "binary", threshold: 145, invert: false, despeckle: true, pathomit: 10, ltres: 1.8, qtres: 1.8, sampleStep: step },
    { label: "Binary 155 / omit 12", mode: "binary", threshold: 155, invert: false, despeckle: true, pathomit: 12, ltres: 2.1, qtres: 2.1, sampleStep: step },
    { label: "Logo Binary 135 / omit 8", mode: "binary", threshold: 135, invert: false, despeckle: true, pathomit: 8, ltres: 1.6, qtres: 1.6, sampleStep: step }
  ];
}

function buildManualPreset() {
  const mode = traceMode.value === "auto" || traceMode.value === "logo" ? "binary" : traceMode.value;

  return {
    label: "Manual",
    mode,
    colors: Math.max(2, Math.min(16, Number(numColors.value) || 4)),
    threshold: Number(threshold.value),
    invert: invert.checked,
    despeckle: despeckle.checked,
    pathomit: Number(pathomit.value),
    ltres: Number(ltres.value),
    qtres: Number(qtres.value),
    sampleStep: Number(sampleStep.value) || 2.5
  };
}

function runPresetTrace(baseImageData, preset) {
  let sourceImageData;

  if (preset.mode === "color") {
    sourceImageData = new ImageData(
      new Uint8ClampedArray(baseImageData.data),
      baseImageData.width,
      baseImageData.height
    );
  } else {
    sourceImageData = buildBinaryImageData(
      baseImageData,
      preset.threshold,
      preset.invert,
      preset.despeckle
    );
  }

  const svg = ImageTracer.imagedataToSVG(sourceImageData, makeTraceOptions(preset));
  const sampled = sampleSvgPaths(svg, preset.sampleStep);

  let filteredPolys = sampled.polylines.filter((poly) => {
    const bounds = getPolylineBounds(poly.points);
    return bounds.width > 1 || bounds.height > 1;
  });

  filteredPolys = cleanupPolylines(filteredPolys);

  const normalized = normalizePolylinesForDxf(
    filteredPolys,
    sampled.viewBox.height,
    Number(exportScale.value) || 1
  );

  return {
    preset,
    svg,
    polylines: normalized.polylines,
    score: scoreTraceResult(normalized.polylines)
  };
}

async function autoTraceImage() {
  if (!originalImage) {
    setStatus("Load a PNG first.");
    return;
  }

  showLoading("Cleaning artwork and building trace candidates…");

  try {
    await new Promise((r) => setTimeout(r, 40));

    const baseImageData = buildBaseImageData();
    drawImageDataToPreview(baseImageData);

    const presets =
      traceMode.value === "auto" || traceMode.value === "logo"
        ? buildAutoPresets()
        : [buildManualPreset()];

    const results = [];

    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i];
      loadingText.textContent = `Testing ${preset.label}…`;
      await new Promise((r) => setTimeout(r, 20));

      try {
        const result = runPresetTrace(baseImageData, preset);
        if (result.polylines.length) {
          results.push(result);
        }
      } catch (err) {
        console.warn("Preset failed:", preset.label, err);
      }
    }

    if (!results.length) {
      throw new Error("All trace presets failed.");
    }

    results.sort((a, b) => b.score - a.score);
    const best = results[0];

    tracedSvgString = best.svg;
    currentDxfPolylines = best.polylines;
    drawDxfPreview(currentDxfPolylines);
    downloadDxfBtn.disabled = false;

    if (traceMode.value === "auto" || traceMode.value === "logo") {
      if (best.preset.mode === "color") {
        numColors.value = String(best.preset.colors);
      } else {
        threshold.value = String(best.preset.threshold);
        invert.checked = !!best.preset.invert;
        despeckle.checked = !!best.preset.despeckle;
      }

      pathomit.value = String(best.preset.pathomit);
      ltres.value = String(best.preset.ltres);
      qtres.value = String(best.preset.qtres);
      updateValueLabels();
    }

    setStatus(`Trace complete. Chosen preset: ${best.preset.label}. ${currentDxfPolylines.length} clean polylines ready.`);
  } catch (error) {
    console.error(error);
    tracedSvgString = "";
    currentDxfPolylines = [];
    setDefaultDxfCanvas();
    setStatus("Trace failed. Try Logo Mode, adjust threshold, or use a cleaner PNG.");
  } finally {
    hideLoading();
  }
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

function exportDxf() {
  if (!currentDxfPolylines.length) {
    setStatus("No DXF geometry available. Click Auto Trace PNG first.");
    return;
  }

  try {
    const dxf = buildDxf(currentDxfPolylines);
    const name = sanitizeFileName(exportName.value);
    downloadTextFile(dxf, `${name}.dxf`, "application/dxf");
    setStatus(`DXF downloaded. ${currentDxfPolylines.length} clean polylines exported.`);
  } catch (error) {
    console.error(error);
    setStatus("DXF export failed.");
  }
}

function clearAll() {
  originalImage = null;
  tracedSvgString = "";
  currentDxfPolylines = [];

  pngFile.value = "";
  exportName.value = "norrisdxf-output";

  setDefaultPreviewCanvas();
  setDefaultDxfCanvas();

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
      showCurrentImagePreview();

      tracedSvgString = "";
      currentDxfPolylines = [];
      setDefaultDxfCanvas();
      downloadDxfBtn.disabled = true;

      setStatus(`Loaded ${file.name}. Try Logo Mode for marks with letters and interior cutouts.`);
    };
    img.src = e.target.result;
  };

  reader.readAsDataURL(file);
});

[
  threshold,
  invert,
  despeckle,
  pathomit,
  ltres,
  qtres,
  lightBgThreshold,
  numColors
].forEach((el) => {
  el.addEventListener("input", () => {
    updateValueLabels();
    if (originalImage) showCurrentImagePreview();
  });
});

[removeLightBg, removeSmallJunk, preferLogoShapes, detectInteriorHoles].forEach((el) => {
  el.addEventListener("change", () => {
    if (originalImage) showCurrentImagePreview();
  });
});

traceMode.addEventListener("change", () => {
  if (originalImage) showCurrentImagePreview();
});

traceBtn.addEventListener("click", autoTraceImage);
downloadDxfBtn.addEventListener("click", exportDxf);
clearBtn.addEventListener("click", clearAll);

updateValueLabels();
clearAll();
