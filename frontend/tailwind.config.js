/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#020202',
        accent: '#f6ad55',
        foreground: '#f9fafb'
      }
    }
  },
  plugins: []
};
