import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      {
        name: "inject-google-client-id",
        transformIndexHtml: {
          order: "pre" as const,
          handler(html: string) {
            // Only replace in dev — production uses backend runtime injection
            if (mode !== "production" && env.GOOGLE_CLIENT_ID) {
              return html.replace("%%GOOGLE_CLIENT_ID%%", env.GOOGLE_CLIENT_ID);
            }
            return html;
          },
        },
      },
    ],
    root: ".",
    resolve: {
      alias: {
        "@frontend": path.resolve(__dirname, "src/frontend"),
        "@shared": path.resolve(__dirname, "src/shared"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:3000",
      },
    },
    build: {
      outDir: "dist/frontend",
    },
  };
});
