import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        ink: '#080B0E',
        panel: '#11161C',
        line: '#26313D',
        steel: '#8FA3B5',
        mint: '#38D6A7',
        amber: '#FFBA49',
        coral: '#FF6B6B'
      },
      borderRadius: {
        card: '8px',
        control: '6px'
      },
      boxShadow: {
        lift: '0 12px 40px rgba(0, 0, 0, 0.32)'
      }
    }
  }
};

export default preset;
