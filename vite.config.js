import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180, // Set your port number here
  },
  base: './', // Add this line to ensure assets are loaded using file protocol
  build: {
    // Target can be set if necessary, but often it's not needed with modern Electron
    // target: 'esnext',
    outDir: 'build', // The output directory for your built files
    // Rollup options can be specified if you need to customize the build further
  },
  // Define any custom environment variables here if needed
  // You can use `process.env.NODE_ENV` to check if it's production or development
});