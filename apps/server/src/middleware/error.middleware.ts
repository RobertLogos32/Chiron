import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/appError.js";

const isDuplicateKey = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === 11000;

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (typeof err === "object" && err !== null && "type" in err && "status" in err) {
    if (err.type === "entity.parse.failed" && err.status === 400) {
      res.status(400).json({ status: "fail", code: "INVALID_JSON", message: "Il corpo della richiesta deve contenere JSON valido" });
      return;
    }
    if (err.type === "entity.too.large" && err.status === 413) {
      res.status(413).json({ status: "fail", code: "PAYLOAD_TOO_LARGE", message: "Il corpo della richiesta è troppo grande" });
      return;
    }
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ status: "fail", code: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ status: "fail", code: "VALIDATION_ERROR", errors: err.issues });
    return;
  }
  if (isDuplicateKey(err)) {
    res.status(409).json({ status: "fail", code: "EMAIL_ALREADY_EXISTS", message: "Email già registrata" });
    return;
  }
  console.error(err);
  res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "Errore interno del server" });
};
