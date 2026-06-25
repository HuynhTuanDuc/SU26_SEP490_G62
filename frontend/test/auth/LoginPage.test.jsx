import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '../../src/pages/Auth/LoginPage';
import * as apiClient from '../../src/services/apiClient';

vi.mock('../../src/services/apiClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../../src/services/storage', () => ({
  getRememberedEmail: vi.fn(() => ''),
  setRememberedEmail: vi.fn(),
}));

vi.mock('../../src/services/googleIdentity', () => ({
  loadGoogleIdentityScript: vi.fn().mockResolvedValue(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('L1-AUTH-FE-01: renders login form correctly', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: /staff sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('L1-AUTH-FE-02: shows validation errors when fields are empty', async () => {
    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    fireEvent.blur(emailInput);
    fireEvent.blur(passwordInput);
    
    await waitFor(() => {
      expect(screen.getByText('Email is required.')).toBeInTheDocument();
      expect(screen.getByText('Password is required.')).toBeInTheDocument();
    });
  });

  it('L1-AUTH-FE-03: shows validation errors for invalid email and short password', async () => {
    render(<LoginPage />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.blur(emailInput);
    
    fireEvent.change(passwordInput, { target: { value: '123' } });
    fireEvent.blur(passwordInput);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
      expect(screen.getByText('Password must be at least 6 characters.')).toBeInTheDocument();
    });
  });

  it('L1-AUTH-FE-04: submits valid credentials and calls API', async () => {
    const onLoginSuccess = vi.fn();
    apiClient.apiRequest.mockResolvedValueOnce({ token: 'mock-token', user: { email: 'test@example.com' } });
    
    render(<LoginPage onLoginSuccess={onLoginSuccess} />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(apiClient.apiRequest).toHaveBeenCalledWith('/auth/login', {
        method: 'POST',
        body: { email: 'test@example.com', password: 'password123' }
      });
      expect(onLoginSuccess).toHaveBeenCalledWith({
        token: 'mock-token',
        user: { email: 'test@example.com' },
        rememberEmail: ''
      });
    });
  });

  it('L1-AUTH-FE-05: shows error message on API failure', async () => {
    apiClient.apiRequest.mockRejectedValueOnce(new Error('Invalid credentials'));
    
    render(<LoginPage />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    fireEvent.click(submitBtn);
    
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });
});
