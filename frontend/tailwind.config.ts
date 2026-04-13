import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        medisync: {
          darkGreen: "#1B4332",
          lightGreen: "#2D6A4F",
          peach: "#FFB4A2",
          bone: "#FDFDFB",
        },
      },
    },
  },
  plugins: [],
};
export default config;