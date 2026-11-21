function lum(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(rgb1, rgb2) {
  const l1 = lum(...rgb1);
  const l2 = lum(...rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// emerald-700 is #047857 -> [4, 120, 87]
// slate-100 is #f1f5f9 -> [241, 245, 249]
console.log('Contrast emerald-700 on slate-100:', contrast([4, 120, 87], [241, 245, 249]).toFixed(2));
