import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import gemini from "./api/gemini.js";
import aladin from "./api/aladin.js";

function serverlessFunctions() {
  const routes = { "/api/gemini": gemini, "/api/aladin": aladin };

  return {
    name: "local-serverless-functions",
    configureServer(server) {
      Object.entries(routes).forEach(([route, handler]) => {
        server.middlewares.use(route, async (req, res) => {
          try {
            let raw = "";
            for await (const chunk of req) raw += chunk;
            req.body = raw ? JSON.parse(raw) : {};
            res.status = (code) => { res.statusCode = code; return res; };
            res.json = (value) => {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(value));
              return res;
            };
            await handler(req, res);
          } catch (error) {
            if (!res.headersSent) res.statusCode = 500;
            if (!res.writableEnded) {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: error.message || "로컬 API 실행에 실패했습니다." }));
            }
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.entries(env).forEach(([key, value]) => {
    if (process.env[key] === undefined) process.env[key] = value;
  });

  return {
    plugins: [react(), serverlessFunctions()],
    build: { target: "es2022" },
  };
});
