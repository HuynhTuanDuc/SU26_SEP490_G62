const { heroui } = require("@heroui/theme");
const path = require("path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, "src/pages/Accountant/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src/pages/Coordinator/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src/pages/Manager/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src/components/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src/hooks/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "Google Sans", "Open Sans", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [heroui()],
};
