export type UserProfile = {
  id: number;
  email: string | null;
  fullName?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  additionalContact?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserProfile;
};

export type ForgotPasswordResponse = {
  message: string;
};

export type ResetPasswordResponse = {
  message: string;
};
