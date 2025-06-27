// SHA256 hashing using Web Crypto API
async function getSHA256Hash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Simple deterministic PRNG: Mulberry32
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convert hex hash into numeric seed
function hashToSeed(hash) {
  // Take first 8 characters for simplicity
  return parseInt(hash.substring(0, 8), 16);
}

const palette = [
  "#ff007f",
  "#00ffff",
  "#001eff",
  "#ff00ff",
  "#ffeb00",
  "#00ff00",
  "#f72585",
  "#7209b7",
  "#4361ee",
  "#4cc9f0",
  "#22223b",
  "#fca311",
];

// Utility functions
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

// Generate gradient pixel art with slight randomness
function generateGradientPixelArt(rng, width = 16, height = 16, palette) {
  const pixels = [];
  for (let i = 0; i < width * height; i++) {
    pixels.push(palette[Math.floor(rng() * palette.length)]);
  }

  // Instead of sorting by brightness, shuffle with more randomness
  // Fisher-Yates shuffle with deterministic RNG
  for (let i = pixels.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pixels[i], pixels[j]] = [pixels[j], pixels[i]];
  }

  // Optional: create some loose grouping while maintaining randomness
  const groupSize = 3;
  for (let i = 0; i < pixels.length - groupSize; i += groupSize) {
    if (rng() < 0.3) { // 30% chance to create a small cluster
      const color = pixels[i];
      for (let j = 1; j < groupSize && i + j < pixels.length; j++) {
        if (rng() < 0.7) { // 70% chance each pixel in group uses same color
          pixels[i + j] = color;
        }
      }
    }
  }

  const pixelGrid = [];
  for (let y = 0; y < height; y++) {
    pixelGrid[y] = pixels.slice(y * width, (y + 1) * width);
  }

  return pixelGrid;
}

function renderPixelArt(pixels, canvasId, pixelSize = 10) {
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
  const pixelData = generateGradientPixelArt(rng, 16, 16, palette);
  renderPixelArt(pixelData, "pixelCanvas", 10);
}

// Example usage:
// generateAndRender("Cyberpunk Gradient Post");
