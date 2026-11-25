
import type { NextFunction, Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { AppError } from "../utils/appError.js";
import * as dto from "../dto/auth.dto.js";

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { name, email, password } = dto.registerDto.parse( req.body);
    const result = await authService.registerUser({name, email, password});

    res.status(201).json({
      status: "success",
      token: result.token,
      data: { user: result.user },
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {

    const { email, password } = dto.loginDto.parse(req.body);
    const result = await authService.loginUser({email, password});

    res.status(200).json({
      status: "success",
      token: result.token,
    });
  } catch (err) {
    next(err);
  }
};


export const updateMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.header("X-User-Id");
    if (!userId) {
      throw new AppError("User ID mancante nella richiesta dal gateway", 401, "MISSING_USER_ID");
    }
    const { name } = dto.updateMeDto.parse(req.body);
    if (name === undefined) {
      throw new AppError("Nessun campo da aggiornare", 400, "NO_FIELDS");
    }
    if (name !== undefined && !name.trim()) {
      throw new AppError("Il nome utente non può essere vuoto", 400, "INVALID_NAME");
    }

    const user = await authService.updateProfile(userId, { name: name?.trim()});
    res.status(200).json({ status: "success", data: { user } });
  } catch (err) {
    next(err);
  }
};

export const updatePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.header("X-User-Id");
    if (!userId) {
      throw new AppError("User ID mancante nella richiesta dal gateway", 401, "MISSING_USER_ID");
    }
    // ERRORE: qui chiedi almeno 6 caratteri, ma updatePasswordDto e registerDto ne chiedono 8: regole incoerenti.
    // Inoltre se newPassword non è una stringa, `.length` non fa il controllo che ti aspetti.
    // DA FARE: const { currentPassword, newPassword } = updatePasswordDto.parse(req.body);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new AppError("Password attuale e nuova password sono richieste", 400, "MISSING_FIELDS");
    }
    if (newPassword.length < 6) {
      throw new AppError("La nuova password deve avere almeno 6 caratteri", 400, "WEAK_PASSWORD");
    }

    // I token precedenti non valgono più: il client deve salvare questo.
    // ERRORE: authService.updatePassword non esiste. Il commento sopra promette che i vecchi token
    // non valgono più, ma senza tokenVersion (vedi getTokenVersion) non è vero.
    // DA FARE nel service:
    //   1. User.findById(userId).select("+password") e verifica currentPassword con comparePassword (401 se sbagliata)
    //   2. user.password = newPassword; user.tokenVersion += 1; await user.save();
    //      Usa save() e NON findByIdAndUpdate, altrimenti il pre("save") non cifra la nuova password.
    //   3. restituisci un nuovo token con signToken
    const token = await authService.updatePassword(userId, {currentPassword, newPassword});
    res.status(200).json({ status: "success", message: "Password aggiornata", token });
  } catch (err) {
    next(err);
  }
};

export const deleteMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.header("X-User-Id");
    if (!userId) {
      throw new AppError("User ID mancante nella richiesta dal gateway", 401, "MISSING_USER_ID");
    }
    const data = dto.deleteMeDto.parse(req.body);
    await authService.deleteUser(userId, data);
    res.status(200).json({ status: "success", message: "Account eliminato" });
  } catch (err) {
    next(err);
  }
};


