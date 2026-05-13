import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        goodgreen: {
          DEFAULT: '#00B0A0',
          50: '#E6F9F7',
          100: '#B3EDE8',
          200: '#80E1D9',
          300: '#4DD5CA',
          400: '#26CCBF',
          500: '#00B0A0',
          600: '#009A8C',
          700: '#007A6F',
          800: '#005A52',
          900: '#003A35',
        },
        dark: {
          DEFAULT: '#0f1729',
          50: '#1a2540',
          100: '#151e35',
          200: '#121a2e',
          300: '#0f1729',
          400: '#0c1320',
          500: '#091018',
        },
        // CSS-variable-driven tokens (for theming)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: '0 1px 2px 0 hsl(var(--shadow))',
        DEFAULT: '0 1px 3px 0 hsl(var(--shadow)), 0 1px 2px -1px hsl(var(--shadow))',
        md: '0 4px 6px -1px hsl(var(--shadow)), 0 2px 4px -2px hsl(var(--shadow))',
        lg: '0 10px 15px -3px hsl(var(--shadow)), 0 4px 6px -4px hsl(var(--shadow))',
        glow: '0 0 20px 4px hsl(var(--ring) / 0.25)',
      },
    },
  },
  plugins: [],
}
export default config
