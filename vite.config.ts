import { defineConfig } from "vite";

// No @vitejs/plugin-react: the spec allows only react, react-dom, vite and typescript.
// Vite's built-in esbuild compiles TSX with the automatic JSX runtime. The trade-off is
// that edits trigger a full page reload instead of React Fast Refresh.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  // Port 4000 (the spec says 3000; changed at the user's request). strictPort makes the
  // dev server fail instead of silently moving to another port, which would break the
  // redirect URI registered on fhir.epic.com.
  server: { port: 4000, strictPort: true },
});
