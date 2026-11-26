import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDatabase = async () => {
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 5000 });
};
