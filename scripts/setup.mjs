#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const step = (msg) => console.log(`\n==> ${msg}`);
const ok = (msg) => console.log(`    ✓ ${msg}`);
const warn = (msg) => console.log(`    ! ${msg}`);

function run(cmd, options = {}) {
  return execSync(cmd, { cwd: root, stdio: "pipe", encoding: "utf-8", ...options });
}

function commandExists(cmd) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { cwd: root });
  return result.status === 0;
}

step("Verificando Node.js");
const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  warn(`Tenes Node ${process.versions.node}; este proyecto requiere Node 18 o superior.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

step("Instalando dependencias (npm install)");
if (!existsSync(join(root, "node_modules"))) {
  run("npm install", { stdio: "inherit" });
} else {
  ok("node_modules ya existe, salteo npm install (borralo si queres forzar una reinstalacion)");
}

step("Descargando el navegador de Playwright (chromium)");
try {
  run("npx playwright install chromium", { stdio: "inherit" });
  ok("Chromium listo");
} catch {
  warn("No se pudo instalar Chromium automaticamente. Corre 'npx playwright install chromium' a mano.");
}

step("Creando archivo .env");
const envPath = join(root, ".env");
const envExamplePath = join(root, ".env.example");
if (existsSync(envPath)) {
  ok(".env ya existe, no lo toco");
} else {
  copyFileSync(envExamplePath, envPath);
  ok(".env creado a partir de .env.example (completa ML_CLIENT_ID/ML_CLIENT_SECRET cuando quieras publicar)");
}

step("Levantando Redis");
let redisReady = false;
if (commandExists("docker")) {
  try {
    run("docker compose up -d");
    ok("Redis levantado con docker compose");
    redisReady = true;
  } catch {
    warn("Docker esta instalado pero 'docker compose up -d' fallo. Revisa el error corriendolo a mano.");
  }
} else {
  warn("Docker no esta disponible.");
}

if (!redisReady && commandExists("redis-cli")) {
  try {
    run("redis-cli ping");
    ok("Ya hay un Redis corriendo en localhost:6379");
    redisReady = true;
  } catch {
    if (commandExists("redis-server")) {
      try {
        run("redis-server --daemonize yes");
        ok("Redis local iniciado (redis-server --daemonize yes)");
        redisReady = true;
      } catch {
        warn("No se pudo iniciar redis-server automaticamente.");
      }
    }
  }
}

if (!redisReady) {
  warn("No se encontro una forma de levantar Redis automaticamente.");
  warn("Instala Docker (recomendado) o Redis y volve a correr 'npm run setup',");
  warn("o levantalo vos mismo y asegurate que REDIS_URL en .env apunte ahi.");
}

console.log(`
Listo. Proximos pasos:

  1. (Opcional, para publicar de verdad en MercadoLibre) completa en .env:
       ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI
     y despues corre:
       npm run ml:auth

  2. Levanta la API + el worker:
       npm run dev

  3. Abri http://localhost:3000, pega una URL de un producto de Amazon
     y toca "Importar de Amazon".
`);
