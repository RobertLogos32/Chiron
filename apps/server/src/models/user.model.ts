import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export interface UserDocument extends mongoose.Document{
    name: string;
    email: string;
    password: string;
    comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new mongoose.Schema<UserDocument>(
    // 1° argomento: i campi
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
    },

    {
        toJSON: {
            transform: (_doc, ret) => {
                const { password: _password, ...user } = ret;
                return user;
            },
        },
    },
);

// Cifra la password prima del salvataggio, solo se è stata modificata.
userSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password) return;
    this.password = await bcrypt.hash(this.password, 12);
});

// Confronta una password in chiaro con quella cifrata (serve select("+password") nella query).
userSchema.methods.comparePassword = function (candidate: string): Promise<boolean> {
    return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<UserDocument>("user", userSchema);