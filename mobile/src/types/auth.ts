export type UserRole = 'manager' | 'coordinator' | 'accountant' | 'driver';

export type AuthUser = {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  message: string;
  token: string;
  refreshToken?: string;
  user: AuthUser;
};
