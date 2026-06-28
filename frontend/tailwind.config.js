const { heroui } = require("@heroui/theme");
const path = require("path");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, "src/pages/Accountant/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "src/components/**/*.{js,jsx,ts,tsx}"),
    path.join(__dirname, "node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {},
  },
  plugins: [heroui()],
};
