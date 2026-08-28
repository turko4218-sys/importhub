import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  return res;
}

function basicAuthHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

describe("basicAuthMiddleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("deja pasar sin pedir nada si no hay APP_USERNAME/APP_PASSWORD configurados", async () => {
    delete process.env.APP_USERNAME;
    delete process.env.APP_PASSWORD;
    const { basicAuthMiddleware } = await import("../src/api/basicAuth.js");
    const middleware = basicAuthMiddleware();

    const next = vi.fn();
    const res = fakeRes();
    middleware({ headers: {} } as any, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rechaza con 401 si faltan credenciales", async () => {
    process.env.APP_USERNAME = "admin";
    process.env.APP_PASSWORD = "secreto123";
    const { basicAuthMiddleware } = await import("../src/api/basicAuth.js");
    const middleware = basicAuthMiddleware();

    const next = vi.fn();
    const res = fakeRes();
    middleware({ headers: {} } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rechaza con 401 si las credenciales son incorrectas", async () => {
    process.env.APP_USERNAME = "admin";
    process.env.APP_PASSWORD = "secreto123";
    const { basicAuthMiddleware } = await import("../src/api/basicAuth.js");
    const middleware = basicAuthMiddleware();

    const next = vi.fn();
    const res = fakeRes();
    middleware(
      { headers: { authorization: basicAuthHeader("admin", "incorrecta") } } as any,
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("deja pasar con las credenciales correctas", async () => {
    process.env.APP_USERNAME = "admin";
    process.env.APP_PASSWORD = "secreto123";
    const { basicAuthMiddleware } = await import("../src/api/basicAuth.js");
    const middleware = basicAuthMiddleware();

    const next = vi.fn();
    const res = fakeRes();
    middleware(
      { headers: { authorization: basicAuthHeader("admin", "secreto123") } } as any,
      res,
      next
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
