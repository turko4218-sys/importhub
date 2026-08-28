import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Basic Auth para todo el panel/API. Se activa solo si APP_USERNAME y
 * APP_PASSWORD estan seteados en .env; si no, deja pasar sin pedir nada
 * (pensado para uso local en localhost durante desarrollo).
 */
export function basicAuthMiddleware() {
  const { username, password } = config.auth;

  if (!username || !password) {
    console.warn(
      "[api] ATENCION: APP_USERNAME/APP_PASSWORD no estan configurados; el panel queda sin autenticacion. " +
        "No lo expongas fuera de tu propia maquina asi."
    );
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Basic ")) {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
      const separatorIndex = decoded.indexOf(":");
      const user = decoded.slice(0, separatorIndex);
      const pass = decoded.slice(separatorIndex + 1);
      if (safeEqual(user, username) && safeEqual(pass, password)) {
        return next();
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="importhub"');
    res.status(401).send("Autenticacion requerida.");
  };
}
