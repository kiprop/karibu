import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        ground: v('ground'), panel: v('panel'), soft: v('soft'), ink: v('ink'), muted: v('muted'), line: v('line'),
        brand: v('brand'), 'brand-ink': v('brand-ink'), 'brand-soft': v('brand-soft'),
        teal: v('teal'), 'teal-soft': v('teal-soft'), amber: v('amber'), 'amber-soft': v('amber-soft'),
        danger: v('danger'), 'danger-soft': v('danger-soft'), star: v('star'),
      },
      fontFamily: {
        // One crisp family, like the staff console. "display" is the same face set tighter.
        display: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      // Calmer weights: "bold" reads as semibold and "extrabold" as bold.
      fontWeight: { bold: '600', extrabold: '650' },
      // Sharper corners across the site.
      borderRadius: { lg: '8px', xl: '10px', '2xl': '12px', '3xl': '16px', xl2: '12px' },
    },
  },
  plugins: [],
} satisfies Config;
