import { createInterface } from "node:readline/promises";
import { nanoid } from "nanoid";
import { buildAuthorizationUrl, exchangeCodeForTokens } from "../mercadolibre/auth.js";

function extractCode(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (code) return code;
  } catch {
    // no era una URL, asumimos que ya es el codigo
  }
  return trimmed;
}

async function main(): Promise<void> {
  const state = nanoid();
  const authUrl = buildAuthorizationUrl(state);

  console.log("1. Abri esta URL en el navegador donde tengas la sesion de MercadoLibre iniciada:\n");
  console.log(`   ${authUrl}\n`);
  console.log("2. Autoriza la aplicacion.");
  console.log("3. Vas a ser redirigido a tu ML_REDIRECT_URI con un parametro ?code=...");
  console.log("   Pega aca la URL completa a la que fuiste redirigido, o directamente el codigo.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Pega la URL o el codigo: ");
  rl.close();

  const code = extractCode(answer);
  const tokens = await exchangeCodeForTokens(code);

  console.log("\nAutorizacion exitosa. Tokens guardados en data/ml-token.json");
  console.log(`Sugerencia: guarda este refresh_token en tu .env como respaldo:\n`);
  console.log(`ML_REFRESH_TOKEN=${tokens.refreshToken}\n`);
}

main().catch((error) => {
  console.error("Error en la autorizacion de MercadoLibre:", error);
  process.exit(1);
});
