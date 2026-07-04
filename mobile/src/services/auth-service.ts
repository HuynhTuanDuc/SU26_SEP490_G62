import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { ERROR_MESSAGES } from '@/constants/error-messages';
import { tokenStorage } from '@/services/token-storage';
import type { LoginRequest, LoginResponse } from '@/types/auth';

const validateDriver = async (result: LoginResponse) => {
  if (result.user.role !== 'driver') {
    await tokenStorage.clearAll();
    throw new ApiError(ERROR_MESSAGES.driverOnly, 403);
  }
  await tokenStorage.setToken(result.token);
  if (result.refreshToken) await tokenStorage.setRefreshToken(result.refreshToken);
  return result;
};

export const authService = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const result = await apiClient.post<LoginResponse>('/auth/login', payload);
    return validateDriver(result);
  },

  async loginWithGoogle(credential: string): Promise<LoginResponse> {
    const result = await apiClient.post<LoginResponse>('/auth/google', { credential });
    return validateDriver(result);
  },
};
