import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

// Non ancora collegato a nessuna rotta (l'autenticazione a valle usa X-User-Id
// iniettato dal gateway) — tenuto tipizzato per usi futuri.
export default function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.header("x-auth-token");
  if (!token) {
    res.status(401).json({
      status: "fail",
      message: "Accesso negato. Nessun token fornito.",
    });
    return;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    req.user = { id: decoded.id };
    next();
  } catch {
    res.status(401).json({
      status: "fail",
      message: "Token non valido o scaduto.",
    });
  }
}

/*
 * MIDDLEWARE CHE SERVONO ALL'APPLICAZIONE
 *
 * --- Globali (in app.ts, prima delle route) ---
 *
 * - helmet            -> aggiunge header HTTP di sicurezza (npm i helmet).
 * - cors              -> già presente; configurare `origin` con i domini ammessi, non lasciarlo aperto a tutti.
 * - express.json      -> già presente; impostare un `limit` (es. "10kb") per evitare body enormi.
 * - rate limiter      -> limita le richieste per IP (npm i express-rate-limit); globale e più stretto su
 *                        /login, /register, /forgot-password per bloccare brute force e spam di email.
 * - request logger    -> logga metodo, URL, status e tempo di risposta (es. morgan o pino-http).
 *
 * --- Per route ---
 *
 * - validate(schema)  -> valida req.body (o params/query) con gli schemi zod in dto/auth.dto.ts.
 *                        Va su tutte le route che ricevono dati: register, login, forgot, reset, update...
 * - authMiddleware    -> questo file; protegge le route private (/me, /me/password, /logout...).
 *                        Da migliorare: header Authorization Bearer, `algorithms` in jwt.verify,
 *                        controllo di tokenVersion per rendere logout e cambio password efficaci.
 * - requireRole(...)  -> solo se avrai ruoli (es. admin): controlla req.user.role dopo authMiddleware.
 * - requireVerified   -> solo se usi la verifica email: blocca chi non ha confermato l'indirizzo.
 *
 * --- Da mettere per ultimi in app.ts (dopo le route) ---
 *
 * - notFoundHandler   -> risponde 404 JSON per le route inesistenti.
 * - errorHandler      -> middleware a 4 argomenti (err, req, res, next): trasforma AppError e gli errori
 *                        imprevisti in risposte JSON coerenti, senza mostrare stack trace in produzione.
 *                        Serve anche per gestire errori Mongoose (duplicate key 11000, ValidationError).
 */
