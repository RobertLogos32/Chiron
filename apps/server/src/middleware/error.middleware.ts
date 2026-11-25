import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/appError.js";

// Mongo lancia un errore con codice 11000 quando violi un indice unique (oggi solo email)
const isDuplicateKey = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === 11000;

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Errori previsti, lanciati da te con AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ status: "fail", code: err.code, message: err.message });
    return;
  }
  // Body non valido (registerDto.parse, loginDto.parse...)
  if (err instanceof ZodError) {
    res.status(400).json({ status: "fail", code: "VALIDATION_ERROR", errors: err.issues });
    return;
  }
  // Email già registrata
  if (isDuplicateKey(err)) {
    res.status(409).json({ status: "fail", code: "EMAIL_ALREADY_EXISTS", message: "Email già registrata" });
    return;
  }
  // Tutto il resto è un bug o un problema del server: lo logghi, ma al client non mostri i dettagli
  console.error(err);
  res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "Errore interno del server" });
};