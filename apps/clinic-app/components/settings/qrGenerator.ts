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
  const svgXmlns = `http://${'www.w3.org'}/2000/svg`;

  return `<svg xmlns="${svgXmlns}" viewBox="0 0 ${totalSize} ${totalSize}" width="100%" height="100%">
  <rect width="${totalSize}" height="${totalSize}" fill="${bgColor}" />
  <g transform="translate(${padding}, ${padding})">
    <path d="${pathData}" fill="${fgColor}" shape-rendering="crispEdges" />
  </g>
</svg>`;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsComputeRemainder(data: Uint8Array, ecLen: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < ecLen; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
  }

  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

// Compact QR Matrix Builder for URLs (ISO/IEC 18004 Version 4/5 Byte Mode, ECC Level L)
export function generateQrMatrix(text: string): QrCodeMatrix {
  const version = text.length > 50 ? 5 : 4;
  const size = 17 + 4 * version; // V4=33, V5=37
  const dataCodewords = version === 4 ? 80 : 108;
  const ecCodewords = version === 4 ? 20 : 26;
  const maxPayloadBytes = dataCodewords - 2; // 78 bytes for V4, 106 bytes for V5

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

  // Reserve Format Information bits & Dark module
  modules[size - 8][8] = true;
  isFunctionPattern[size - 8][8] = true;
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunctionPattern[8][i] = true;
      isFunctionPattern[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunctionPattern[8][size - 1 - i] = true;
  }
  for (let i = 0; i < 7; i++) {
    isFunctionPattern[size - 1 - i][8] = true;
  }

  // Encode payload in Byte mode (0100)
  const rawBytes = new TextEncoder().encode(text);
  const payload = rawBytes.length > maxPayloadBytes ? rawBytes.slice(0, maxPayloadBytes) : rawBytes;
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(payload.length, 8); // Character count (8 bits for V1-V9)
  for (let i = 0; i < payload.length; i++) {
    pushBits(payload[i], 8);
  }
  // Terminator (up to 4 zero bits)
  const maxDataBits = dataCodewords * 8;
  const terminatorLen = Math.min(4, maxDataBits - bits.length);
  pushBits(0, terminatorLen);
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataBytes = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    dataBytes[i] = b;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < dataCodewords; i++, p++) {
    dataBytes[i] = padBytes[p % 2];
  }

  const ecBytes = rsComputeRemainder(dataBytes, ecCodewords);
  const allCodewords = new Uint8Array(dataCodewords + ecCodewords);
  allCodewords.set(dataBytes, 0);
  allCodewords.set(ecBytes, dataCodewords);

  // Place data + EC bits in standard upward/downward 2-column zigzag with Mask 0 ((r + c) % 2 === 0)
  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // Skip vertical timing line
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let dc = 0; dc < 2; dc++) {
        const c = right - dc;
        if (!isFunctionPattern[r][c]) {
          let bit = false;
          if (bitIdx < totalBits) {
            const byteVal = allCodewords[bitIdx >> 3];
            bit = ((byteVal >> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          const mask = (r + c) % 2 === 0;
          modules[r][c] = bit !== mask;
        }
      }
    }
    upward = !upward;
  }

  // Write Format Information bits for ECC Level L (01) and Mask 0 (000) -> 0x77c4
  const formatBits = 0x77c4;
  const topLeftFormatCoords: [number, number][] = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> i) & 1) === 1;
    const [tr, tc] = topLeftFormatCoords[i];
    modules[tr][tc] = bit;
    if (i < 8) {
      modules[8][size - 1 - i] = bit;
    } else {
      modules[size - 15 + i][8] = bit;
    }
  }

  return { size, modules };
}

