/**
 * Tiny computer-vision helpers for printed sheet music — no dependencies,
 * plain arrays in, plain arrays out (works in a browser or in Node tests).
 */

/** RGBA bytes → 0..255 grayscale. */
export function toGray(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
  }
  return gray;
}

/** Otsu's threshold — good enough for scans and phone photos of paper. */
export function otsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  // Keep the threshold usable: 0 would classify even pure ink as "paper".
  return Math.max(1, Math.min(254, best));
}

/** 1 = ink, 0 = paper. */
export function binarize(gray, threshold) {
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] <= threshold ? 1 : 0;
  return bin;
}

/**
 * Horizontal staff lines: rows that are dark across most of the page.
 * @returns {{y: number, start: number, end: number}[]}
 */
export function findHorizontalLines(bin, width, height, minCoverage = 0.45) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) count += bin[y * width + x];
    if (count >= width * minCoverage) rows.push(y);
  }
  const groups = [];
  for (const y of rows) {
    const last = groups[groups.length - 1];
    if (last && y - last.end <= 1) last.end = y;
    else groups.push({ start: y, end: y });
  }
  return groups.map((g) => ({ y: (g.start + g.end) / 2, start: g.start, end: g.end }));
}

/**
 * Group detected lines into staves of five evenly spaced lines.
 * @returns {{lines: {y:number,start:number,end:number}[], spacing: number, top: number, bottom: number, thickness: number}[]}
 */
export function groupStaves(lines) {
  const staves = [];
  for (let i = 0; i + 4 < lines.length; i++) {
    const five = lines.slice(i, i + 5);
    const gaps = five.slice(1).map((line, k) => line.y - five[k].y);
    const spacing = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (spacing < 4 || spacing > 80) continue;
    const even = gaps.every((g) => Math.abs(g - spacing) <= spacing * 0.25);
    if (!even) continue;
    staves.push({
      lines: five,
      spacing,
      top: five[0].y,
      bottom: five[4].y,
      thickness: Math.max(1, Math.round(five.reduce((sum, l) => sum + (l.end - l.start), 0) / 5) + 1),
    });
    i += 4;
  }
  return staves;
}

/** Erase the staff lines so only noteheads and stems are left. */
export function removeLines(bin, width, staff) {
  for (const line of staff.lines) {
    for (let y = line.start; y <= line.end; y++) {
      for (let x = 0; x < width; x++) bin[y * width + x] = 0;
    }
  }
}

/**
 * Removing a line cuts every notehead that sits on it in half. Bridge the
 * removed rows back together wherever ink continues above and below, so one
 * notehead stays one blob.
 */
export function repairRemovedLines(bin, width, height, staff) {
  const freed = new Set();
  for (const line of staff.lines) {
    for (let y = Math.max(0, line.start); y <= Math.min(height - 1, line.end); y++) freed.add(y);
  }
  for (const y of freed) {
    const up = y - 2 >= 0 ? y - 2 : -1;
    const down = y + 2 < height ? y + 2 : -1;
    if (up < 0 || down < 0) continue;
    for (let x = 0; x < width; x++) {
      if (bin[up * width + x] && bin[down * width + x]) bin[y * width + x] = 1;
    }
  }
}

/**
 * Connected components (4-neighbour flood fill) inside a vertical band.
 * @returns {{x0:number,y0:number,x1:number,y1:number,area:number,pixels:number[]}[]}
 */
export function components(bin, width, height, yMin, yMax, minArea = 6) {
  const seen = new Uint8Array(bin.length);
  const out = [];
  const stack = [];
  for (let y = yMin; y <= yMax; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!bin[index] || seen[index]) continue;
      stack.length = 0;
      stack.push(index);
      seen[index] = 1;
      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      let area = 0;
      const pixels = [];
      while (stack.length) {
        const current = stack.pop();
        const cy = (current / width) | 0;
        const cx = current - cy * width;
        area++;
        pixels.push(current);
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
        if (cx > 0) {
          const n = current - 1;
          if (bin[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
        if (cx + 1 < width) {
          const n = current + 1;
          if (bin[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
        if (cy > 0) {
          const n = current - width;
          if (bin[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
        if (cy + 1 < height) {
          const n = current + width;
          if (bin[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      if (area >= minArea) out.push({ x0, y0, x1, y1, area, pixels });
    }
  }
  return out;
}

/** Dark pixels per row inside a bounding box (used to find the notehead inside a stem). */
export function rowProfile(comp, width, yFrom, yTo) {
  const counts = new Array(yTo - yFrom + 1).fill(0);
  for (const p of comp.pixels) {
    const y = (p / width) | 0;
    if (y >= yFrom && y <= yTo) counts[y - yFrom]++;
  }
  return counts;
}
