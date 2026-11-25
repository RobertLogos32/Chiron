import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import * as dto from "../dto/auth.dto.js";
import { AppError } from "../utils/appError.js";
import mongoose from "mongoose";


const signToken = (id: unknown): string => {
  return jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const registerUser = async ({name, email, password} : dto.RegisterDto)  => {
    const newUser = await User.create ({name, email, password});
    const token = signToken(newUser.id);
    return { user: newUser, token };

}

export const loginUser = async ({email, password} : dto.LoginDto) => {
  const user = await User.findOne({email}).select("+password");
  if (!user || !(await user.comparePassword(password))){
    throw new AppError("Email o password sbagliate", 401, "INVALIDE_CREDENTIAL");
  }
  const token = signToken(user.id);
  return { token }
}

export const updateProfile = async (userId : string, data : dto.UpdateMeDto) =>{
  if(!mongoose.isValidObjectId(userId)){
    throw new AppError("Utente non trovato",404, "USER_NOT_FOUND");
  }
  const user = await User.findByIdAndUpdate(userId, data, { new: true, runValidators: true });

  if(!user){
    throw new AppError("Utente non trovato",404, "USER_NOT_FOUND");
  }
  return user;
}


export const updatePassword = async (userId: string, data: dto.UpdatePasswordDto) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError("Utente non trovato", 404, "USER_NOT_FOUND");
  }

  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new AppError("Utente non trovato", 404, "USER_NOT_FOUND");
  }

  if (!(await user.comparePassword(data.currentPassword))) {
    throw new AppError("Password attuale errata", 400, "WRONG_CURRENT_PASSWORD");
  }

  user.password = data.newPassword;
  await user.save();

  return signToken(user.id);
};

export const deleteUser = async (userId: string, data: dto.DeleteMeDto) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError("Utente non trovato", 404, "USER_NOT_FOUND");
  }

  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new AppError("Utente non trovato", 404, "USER_NOT_FOUND");
  }

  // Conferma: senza la password giusta non si cancella niente
  if (!(await user.comparePassword(data.password))) {
    throw new AppError("Password errata", 400, "WRONG_PASSWORD");
  }

  await user.deleteOne();
};