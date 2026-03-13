// SHA256 hashing using Web Crypto API
async function getSHA256Hash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToSeed(hash) {
  return parseInt(hash.substring(0, 8), 16);
}

const palette = [
  "#ff007f","#00ffff","#001eff","#ff00ff","#ffeb00",
  "#00ff00","#f72585","#7209b7","#4361ee","#4cc9f0",
  "#22223b","#fca311",
];

function hexToRgb(hex) {
  hex = hex.replace("#", "");
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
}

function getBrightness(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function noise2D(x, y, rng, scale = 0.1) {
  const nx = x * scale;
  const ny = y * scale;
  const a = Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453;
  const b = Math.sin(nx * 93.9898 + ny * 47.233) * 28653.8142;
  const c = Math.sin(nx * 65.9898 + ny * 12.233) * 91735.2341;
  const rngInfluence = rng() * 0.3;
  return (Math.abs(a % 1) + Math.abs(b % 1) + Math.abs(c % 1)) / 3 + rngInfluence;
}

function generateGradientPixelArt(rng, width = 32, height = 32, palette) {
  const pixelGrid = [];
  const scale = 0.1;
  const noiseOffsetX = rng() * 100;
  const noiseOffsetY = rng() * 100;
  for (let y = 0; y < height; y++) {
    pixelGrid[y] = [];
    for (let x = 0; x < width; x++) {
      const noiseValue = noise2D(x + noiseOffsetX, y + noiseOffsetY, rng, scale);
      const paletteIndex = Math.floor((noiseValue % 1) * palette.length);
      pixelGrid[y][x] = palette[paletteIndex];
    }
  }
  if (rng() < 0.4) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (rng() < 0.3) {
          const neighbors = [pixelGrid[y-1][x], pixelGrid[y+1][x], pixelGrid[y][x-1], pixelGrid[y][x+1]];
          pixelGrid[y][x] = neighbors[Math.floor(rng() * neighbors.length)];
        }
      }
    }
  }
  return pixelGrid;
}

function renderPixelArt(pixels, canvasId, pixelSize = 2) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  pixels.forEach((row, y) => {
    row.forEach((color, x) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    });
  });
}

async function generateAndRender(title) {
  const hash = await getSHA256Hash(title);
  const seed = hashToSeed(hash);
  const rng = mulberry32(seed);
  const pixelData = generateGradientPixelArt(rng, 32, 32, palette);
  renderPixelArt(pixelData, "pixelCanvas", 2);
}
