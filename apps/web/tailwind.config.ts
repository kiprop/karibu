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
        display: ['"Bricolage Grotesque"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
} satisfies Config;
