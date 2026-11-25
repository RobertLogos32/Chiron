import { z } from "zod";

export const registerDto = z.object({
    name: z.string().trim().min(2).max(50),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72)
});

export const loginDto = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1)
})

export const forgotPasswordDto = z.object({
    email: z.string().trim().toLowerCase().email()
})

export const resetPasswordDto = z.object({
    token: z.string().min(1),
    password: z.string().min(8).max(72)
})

export const updateMeDto = z.object({
    name: z.string().trim().min(2).max(50).optional()
    /*  in futuro update anche della mail che chiede la 
        verifica e la validazione della mail    */
})
.strict()
.refine((data) => Object.keys(data).length > 0, {
    message: "Specifica almeno un campo da aggiornare",
});

export const deleteMeDto = z.object({
    password: z.string().min(1)
})

export const updatePasswordDto = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(72)
})

export type RegisterDto = z.infer<typeof registerDto>;
export type LoginDto = z.infer<typeof loginDto>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordDto>;
export type ResetPasswordDto = z.infer<typeof resetPasswordDto>;
export type UpdateMeDto = z.infer<typeof updateMeDto>;
export type DeleteMeDto = z.infer<typeof deleteMeDto>;
export type UpdatePasswordDto = z.infer<typeof updatePasswordDto>;
