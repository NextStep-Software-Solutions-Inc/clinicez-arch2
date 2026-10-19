/**
 * Zero-dependency pure TypeScript QR Matrix & SVG Builder for digital passes.
 */

export interface QrCodeMatrix {
  size: number;
  modules: boolean[][];
}

export function buildQrPathData(modules: boolean[][]): string {
  const size = modules.length;
  let path = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        path += `M${c},${r}h1v1h-1Z `;
      }
    }
  }
  return path.trim();
}

export function buildQrSvgString(
  matrix: QrCodeMatrix,
  fgColor: string = "currentColor",
  bgColor: string = "transparent"
): string {
  const { size, modules } = matrix;
  const pathData = buildQrPathData(modules);
  const padding = 2; // Quiet zone
  const totalSize = size + padding * 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="100%" height="100%">
  <rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" />
  <g transform="translate(${padding}, ${padding})">
    <path d="${pathData}" fill="${fgColor}" shape-rendering="crispEdges" />
  </g>
</svg>`;
}

export function generateQrMatrix(text: string): QrCodeMatrix {
  const version = text.length > 50 ? 5 : 4;
  const size = 17 + 4 * version; // V4=33, V5=37
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFinder(startR: number, startC: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = startR + r;
        const nc = startC + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isFunction[nr][nc] = true;
          const isBlack =
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          modules[nr][nc] = isBlack;
        }
      }
    }
  }

  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    isFunction[6][i] = true;
    modules[6][i] = i % 2 === 0;
    isFunction[i][6] = true;
    modules[i][6] = i % 2 === 0;
  }

  // Deterministic data bit filling
  const bytes = new TextEncoder().encode(text);
  let byteIdx = 0;
  let bitIdx = 7;

  let right = size - 1;
  let upward = true;

  while (right > 0) {
    if (right === 6) right--; // Skip vertical timing pattern
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          let bit = false;
          if (byteIdx < bytes.length) {
            bit = ((bytes[byteIdx] >> bitIdx) & 1) === 1;
            bitIdx--;
            if (bitIdx < 0) {
              bitIdx = 7;
              byteIdx++;
            }
          }
          // Mask pattern (r + c) % 2 === 0
          const mask = (r + c) % 2 === 0;
          modules[r][c] = mask ? !bit : bit;
        }
      }
    }
    right -= 2;
    upward = !upward;
  }

  return { size, modules };
}
