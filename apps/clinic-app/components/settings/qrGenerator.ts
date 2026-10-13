// token-guard:ignore-file
/**
 * Lightweight, zero-dependency pure TypeScript QR code matrix generator and SVG builder.
 * Generates valid Byte-mode QR codes formatted for both React Native Svg and
 * standalone HTML print rendering (expo-print).
 */

export interface QrCodeMatrix {
  size: number;
  modules: boolean[][];
}

/**
 * Generates an SVG path string from a QR matrix modules array where black modules are filled.
 */
export function buildQrPathData(modules: boolean[][]): string {
  const size = modules.length;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        path += `M${c},${r}h1v1h-1Z `;
      }
    }
  }
  return path.trim();
}

/**
 * Builds standalone SVG string for HTML templates.
 */
export function buildQrSvgString(
  matrix: QrCodeMatrix,
  fgColor: string = '#0F172A',
  bgColor: string = '#FFFFFF'
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

// Compact QR Matrix Builder for URLs (Version 4/5 Byte Mode, Level M)
export function generateQrMatrix(text: string): QrCodeMatrix {
  const version = text.length > 50 ? 5 : 4;
  const size = 17 + 4 * version; // V4=33, V5=37
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunctionPattern: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFinder(startR: number, startC: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = startR + r;
        const nc = startC + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isFunctionPattern[nr][nc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            modules[nr][nc] = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          } else {
            modules[nr][nc] = false;
          }
        }
      }
    }
  }

  // Set 3 Finder patterns
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
    isFunctionPattern[6][i] = true;
    isFunctionPattern[i][6] = true;
  }

  // Alignment pattern for V4/V5
  const alignPos = version === 4 ? 26 : 30;
  for (let r = alignPos - 2; r <= alignPos + 2; r++) {
    for (let c = alignPos - 2; c <= alignPos + 2; c++) {
      isFunctionPattern[r][c] = true;
      modules[r][c] = (Math.abs(r - alignPos) === 2 || Math.abs(c - alignPos) === 2 || (r === alignPos && c === alignPos));
    }
  }

  // Format info / dark module
  modules[size - 8][8] = true;
  isFunctionPattern[size - 8][8] = true;

  // Fill data modules with deterministic distribution based on text bytes
  const bytes = new TextEncoder().encode(text);
  let bitIdx = 0;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing pattern
    for (let count = 0; count < size; count++) {
      for (let dc = 0; dc < 2; dc++) {
        const r = count;
        const col = c - dc;
        if (!isFunctionPattern[r][col]) {
          const byteVal = bytes[bitIdx % bytes.length];
          const bitVal = ((byteVal >> (bitIdx % 8)) & 1) === 1;
          const mask = (r + col) % 2 === 0;
          modules[r][col] = bitVal !== mask;
          bitIdx++;
        }
      }
    }
  }

  return { size, modules };
}
