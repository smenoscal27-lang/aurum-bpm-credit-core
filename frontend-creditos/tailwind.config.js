/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fintech: {
          darkest: '#080B11',
          dark: '#0D121F',
          card: '#131B2E',
          surface: '#1A243B',
          border: '#24304D',
          hover: '#2A3859',
          accent: '#10B981',
          gold: '#F59E0B'
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      }
    },
  },
  plugins: [],
}

