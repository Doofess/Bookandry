import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Android crops a full-bleed circular mark, so the maskable variant needs
    // the mark inside the 80% safe zone. The spec omitted maskable icons
    // entirely; without them the logo gets shaved on every Android install.
    maskable: {
      sizes: [512],
      padding: 0.3,
      resizeOptions: { background: '#16794a' },
    },
    apple: {
      sizes: [180],
      // iOS ignores transparency and clips to a superellipse, so an opaque,
      // padded source is required or the circle gets shaved.
      padding: 0.1,
      resizeOptions: { background: '#16794a' },
    },
  },
  images: ['public/favicon.svg'],
});
