
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
    const { currentPassword, newPassword } = dto.updatePasswordDto.parse(req.body);

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


