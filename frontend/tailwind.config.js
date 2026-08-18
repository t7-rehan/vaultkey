/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef3ff',
          100: '#e0e9ff',
          500: '#4F7CFF',
          600: '#3b66e6',
          700: '#284ecc',
        },
        navy: {
          900: '#0B1220',
          950: '#080D18',
        },
        surface: {
          light: '#FFFFFF',
          dark: '#101827',
          darkSecondary: '#151F30',
        },
        border: {
          light: '#E6EAF0',
          dark: '#253044',
        },
        txt: {
          primaryLight: '#111827',
          secondaryLight: '#667085',
          primaryDark: '#F8FAFC',
          secondaryDark: '#94A3B8',
        },
        status: {
          success: '#16A34A',
          warning: '#F59E0B',
          danger: '#DC2626',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'lg': '10px',
        'xl': '12px',
      }
    },
  },
  plugins: [],
}
