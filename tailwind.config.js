/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm off-white / charcoal surfaces and a muted green accent.
        canvas: {
          light: '#f7f4ee',
          dark: '#1c1d1b',
        },
        surface: {
          light: '#fffdf8',
          dark: '#242623',
        },
        accent: {
          50: '#eef4ee',
          100: '#d7e6d8',
          200: '#b3ceb6',
          300: '#8bb491',
          400: '#699a70',
          500: '#4f7f57',
          600: '#3e6745',
          700: '#325238',
          800: '#29422e',
          900: '#223726',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
