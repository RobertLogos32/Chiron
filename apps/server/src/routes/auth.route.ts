import express from "express";
import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";

const router: Router = express.Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.patch("/me", controller.updateMe);
router.patch("/me/password", controller.updatePassword);
router.delete("/me", controller.deleteMe);

/*

// Richiedere il recupero della password (invia un'email con un token temporaneo)
router.post("/forgot-password", controller.forgot);

// Impostare la nuova password usando il token temporaneo ricevuto via email
router.post("/reset-password", controller.reset);

// Terminare la sessione sul server (invalida il refresh token / incrementa tokenVersion)
router.post("/logout", controller.logout);

// Rinnovare l'accesso: scambia un refresh token valido con un nuovo access token
router.post("/refresh", controller.refresh);

// Confermare l'indirizzo email tramite il token inviato in fase di registrazione
router.post("/verify-email", controller.verifyEmail);

// Reinviare l'email di verifica se la prima non è arrivata o è scaduta
router.post("/resend-verification", controller.resendVerification);
*/
export default router;