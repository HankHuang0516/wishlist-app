/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                muji: {
                    primary: '#2D2D2D',
                    secondary: '#8E8E8E',
                    accent: '#7F0019',
                    bg: '#F9F9F9',
                    paper: '#FFFFFF',
                    border: '#E5E5E5',
                }
            },
            fontFamily: {
                sans: ['"Helvetica Neue"', 'Helvetica', '"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', 'Arial', '"Yu Gothic"', 'Meiryo', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
