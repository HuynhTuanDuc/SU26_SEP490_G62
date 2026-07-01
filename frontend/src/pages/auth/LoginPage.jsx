import React, { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Space, message } from "antd";
import { apiRequest } from "../../services/apiClient";
import { loadGoogleIdentityScript } from "../../services/googleIdentity";
import { getRememberedEmail } from "../../services/storage";
import "../../styles/Login.css";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(email, password) {
  const errors = { email: "", password: "" };

  if (!email) {
    errors.email = "Email is required.";
  } else if (!emailRegex.test(email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }

  return errors;
}

function validateForgotPasswordStep(step, forgotState) {
  const errors = {};

  if (step === 1) {
    if (!forgotState.email) {
      errors.email = "Email is required.";
    } else if (!emailRegex.test(forgotState.email)) {
      errors.email = "Please enter a valid email address.";
    }
  }

  if (step === 2) {
    if (!forgotState.code) {
      errors.code = "Verification code is required.";
    } else if (forgotState.code.trim().length !== 6) {
      errors.code = "Verification code must be 6 characters.";
    }
  }

  if (step === 3) {
    if (!forgotState.newPassword) {
      errors.newPassword = "New password is required.";
    } else if (forgotState.newPassword.length < 6) {
      errors.newPassword = "Password must be at least 6 characters.";
    }

    if (!forgotState.confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    } else if (forgotState.confirmPassword !== forgotState.newPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
  }

  return errors;
}

const defaultForgotState = {
  email: "",
  code: "",
  newPassword: "",
  confirmPassword: "",
};

export default function LoginPage({ onLoginSuccess }) {
  const rememberedEmail = getRememberedEmail();
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(rememberedEmail));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" });
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotState, setForgotState] = useState(defaultForgotState);
  const [forgotErrors, setForgotErrors] = useState({});
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const googleButtonRef = useRef(null);
  const googleCredentialHandlerRef = useRef(async () => {});

  const googleClientId =
    import.meta.env.VITE_GG_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const syncFieldErrors = (nextEmail, nextPassword) => {
    setFieldErrors(validateCredentials(nextEmail, nextPassword));
  };

  useEffect(() => {
    if (forgotCooldown <= 0) return undefined;

    const timer = window.setInterval(() => {
      setForgotCooldown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [forgotCooldown]);

  const resetForgotFlow = () => {
    setForgotOpen(false);
    setForgotStep(1);
    setForgotState(defaultForgotState);
    setForgotErrors({});
    setForgotCooldown(0);
    setForgotSubmitting(false);
  };

  const updateForgotField = (key, value) => {
    setForgotState((current) => ({ ...current, [key]: value }));
    setForgotErrors((current) => ({ ...current, [key]: "" }));
  };

  googleCredentialHandlerRef.current = async (credential) => {
    if (!credential) {
      throw new Error("No Google credential returned.");
    }

    setGoogleLoading(true);
    setError("");

    try {
      const data = await apiRequest("/auth/google", {
        method: "POST",
        body: { credential },
      });

      const { user } = data;
      if (!user) {
        throw new Error("Unexpected login response from server.");
      }

      onLoginSuccess?.({
        user,
        rememberEmail: remember ? user.email || "" : "",
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrapGoogleButton = async () => {
      if (!googleClientId) {
        setGoogleError("Missing Google client ID in frontend environment.");
        return;
      }

      try {
        await loadGoogleIdentityScript();

        if (cancelled || !googleButtonRef.current || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            try {
              await googleCredentialHandlerRef.current(response.credential);
            } catch (err) {
              setError(err.message || "Google sign-in failed.");
            }
          },
        });

        googleButtonRef.current.innerHTML = "";
        const buttonWidth = Math.max(
          280,
          Math.min(360, googleButtonRef.current.clientWidth || 360),
        );

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          shape: "pill",
          text: "signin_with",
          width: buttonWidth,
        });

        setGoogleReady(true);
        setGoogleError("");
      } catch (err) {
        if (!cancelled) {
          setGoogleError(err.message || "Unable to load Google sign-in.");
        }
      }
    };

    bootstrapGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [googleClientId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const errors = validateCredentials(email, password);
    setFieldErrors(errors);
    setTouched({ email: true, password: true });

    if (errors.email || errors.password) {
      return;
    }

    setSubmitting(true);

    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: { email, password },
      });

      const { user } = data;
      if (!user) {
        throw new Error("Unexpected login response from server.");
      }

      onLoginSuccess?.({
        user,
        rememberEmail: remember ? email : "",
      });
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotRequest = async () => {
    const errors = validateForgotPasswordStep(1, forgotState);
    setForgotErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setForgotSubmitting(true);
      const data = await apiRequest("/auth/forgot-password/request", {
        method: "POST",
        body: { email: forgotState.email },
      });
      setForgotCooldown(Number(data.retry_after_seconds || 60));
      setForgotStep(2);
      message.success(data.message || "Verification code sent.");
    } catch (err) {
      if (Number.isFinite(Number(err?.retry_after_seconds)) && Number(err.retry_after_seconds) > 0) {
        setForgotCooldown(Number(err.retry_after_seconds));
      }
      message.error(err.message || "Unable to send verification code.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleForgotVerify = async () => {
    const errors = validateForgotPasswordStep(2, forgotState);
    setForgotErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setForgotSubmitting(true);
      const data = await apiRequest("/auth/forgot-password/verify", {
        method: "POST",
        body: {
          email: forgotState.email,
          code: forgotState.code.trim().toUpperCase(),
        },
      });
      setForgotStep(3);
      message.success(data.message || "Verification code confirmed.");
    } catch (err) {
      message.error(err.message || "Verification failed.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleForgotReset = async () => {
    const errors = validateForgotPasswordStep(3, forgotState);
    setForgotErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setForgotSubmitting(true);
      const data = await apiRequest("/auth/forgot-password/reset", {
        method: "POST",
        body: {
          email: forgotState.email,
          code: forgotState.code.trim().toUpperCase(),
          newPassword: forgotState.newPassword,
          confirmPassword: forgotState.confirmPassword,
        },
      });
      message.success(data.message || "Password reset successful.");
      setEmail(forgotState.email);
      setPassword("");
      resetForgotFlow();
    } catch (err) {
      message.error(err.message || "Unable to reset password.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const emailError = touched.email ? fieldErrors.email : "";
  const passwordError = touched.password ? fieldErrors.password : "";
  const formIsValid = !fieldErrors.email && !fieldErrors.password && email && password;
  const heroImages = [
    { src: "/anh DN 1.png", className: "hero-image hero-image-1" },
    { src: "/anh DN 2.png", className: "hero-image hero-image-2" },
    { src: "/anh DN 3.jpg", className: "hero-image hero-image-3" },
    { src: "/anh DN 4.jpg", className: "hero-image hero-image-4" },
  ];

  return (
    <>
      <main className="login-root" role="main">
        <aside className="login-left" aria-hidden="true">
          <div className="login-hero">
            <div className="login-hero-orbit">
              {heroImages.map((image) => (
                <div key={image.src} className={image.className}>
                  <img src={encodeURI(image.src)} alt="" aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="login-hero-center">
              <img src="/logo.png" alt="" aria-hidden="true" />
            </div>
          </div>
        </aside>

        <section className="login-right" aria-labelledby="signin-heading">
          <div className="login-card" role="region" aria-label="Sign in">
            <img src="/logo.png" alt="LogisCount" className="login-logo" />
            <h2 id="signin-heading">Staff sign in</h2>
            <p className="login-help">
              Use a pre-provisioned account only. New users cannot register themselves.
            </p>

            <div className="google-login-block">
              <div className="google-login-label">Google Login</div>
              <div
                ref={googleButtonRef}
                className="google-button-container"
                aria-live="polite"
              />
              {!googleReady && !googleError && (
                <div className="login-help">Loading Google sign-in...</div>
              )}
              {googleError && (
                <div className="login-error" role="alert">
                  {googleError}
                </div>
              )}
            </div>

            <div className="login-divider">
              <span>or sign in with email</span>
            </div>

            <form onSubmit={handleSubmit} className="login-form" noValidate>
              <label className="field">
                <span className="label-text">Email</span>
                <input
                  autoFocus
                  aria-label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => {
                    const nextEmail = event.target.value;
                    setEmail(nextEmail);
                    if (touched.email) {
                      syncFieldErrors(nextEmail, password);
                    }
                  }}
                  onBlur={() => {
                    setTouched((current) => ({ ...current, email: true }));
                    syncFieldErrors(email, password);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className={emailError ? "input-error" : ""}
                  required
                />
                {emailError && <div className="field-error">{emailError}</div>}
              </label>

              <label className="field">
                <span className="label-text">Password</span>
                <input
                  aria-label="Password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(event) => {
                    const nextPassword = event.target.value;
                    setPassword(nextPassword);
                    if (touched.password) {
                      syncFieldErrors(email, nextPassword);
                    }
                  }}
                  onBlur={() => {
                    setTouched((current) => ({ ...current, password: true }));
                    syncFieldErrors(email, password);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className={passwordError ? "input-error" : ""}
                  required
                />
                {passwordError && <div className="field-error">{passwordError}</div>}
              </label>

              <div className="login-row">
                <label className="remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  Remember me
                </label>
                <a
                  className="forgot"
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setForgotState((current) => ({ ...defaultForgotState, email }));
                    setForgotErrors({});
                    setForgotStep(1);
                    setForgotOpen(true);
                  }}
                >
                  Forgot password?
                </a>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="login-btn"
                disabled={submitting || !formIsValid || googleLoading}
                aria-disabled={submitting || !formIsValid || googleLoading}
              >
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </main>

      <Modal
        title="Forgot password"
        open={forgotOpen}
        onCancel={resetForgotFlow}
        footer={null}
        destroyOnHidden={false}
      >
        {forgotStep === 1 && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <p>Enter your email. If the account exists, we will send a 6-character verification code.</p>
            <Input
              type="email"
              placeholder="you@example.com"
              value={forgotState.email}
              onChange={(event) => updateForgotField("email", event.target.value)}
              onPressEnter={handleForgotRequest}
              status={forgotErrors.email ? "error" : ""}
            />
            {forgotErrors.email && <div className="field-error">{forgotErrors.email}</div>}
            <Button type="primary" block loading={forgotSubmitting} onClick={handleForgotRequest}>
              Send verification code
            </Button>
          </Space>
        )}

        {forgotStep === 2 && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <p>We sent a 6-character code to <strong>{forgotState.email}</strong>.</p>
            <Input
              placeholder="Enter verification code"
              value={forgotState.code}
              maxLength={6}
              onChange={(event) => updateForgotField("code", event.target.value.toUpperCase())}
              onPressEnter={handleForgotVerify}
              status={forgotErrors.code ? "error" : ""}
            />
            {forgotErrors.code && <div className="field-error">{forgotErrors.code}</div>}
            <Space style={{ width: "100%", justifyContent: "space-between" }}>
              <Button
                disabled={forgotSubmitting || forgotCooldown > 0}
                onClick={handleForgotRequest}
              >
                {forgotCooldown > 0 ? `Resend after ${forgotCooldown}s` : "Resend code"}
              </Button>
              <Button type="primary" loading={forgotSubmitting} onClick={handleForgotVerify}>
                Verify code
              </Button>
            </Space>
          </Space>
        )}

        {forgotStep === 3 && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <p>Enter your new password for <strong>{forgotState.email}</strong>.</p>
            <Input.Password
              placeholder="New password"
              value={forgotState.newPassword}
              onChange={(event) => updateForgotField("newPassword", event.target.value)}
              onPressEnter={handleForgotReset}
              status={forgotErrors.newPassword ? "error" : ""}
            />
            {forgotErrors.newPassword && <div className="field-error">{forgotErrors.newPassword}</div>}
            <Input.Password
              placeholder="Confirm new password"
              value={forgotState.confirmPassword}
              onChange={(event) => updateForgotField("confirmPassword", event.target.value)}
              onPressEnter={handleForgotReset}
              status={forgotErrors.confirmPassword ? "error" : ""}
            />
            {forgotErrors.confirmPassword && <div className="field-error">{forgotErrors.confirmPassword}</div>}
            <Button type="primary" block loading={forgotSubmitting} onClick={handleForgotReset}>
              Save new password
            </Button>
          </Space>
        )}
      </Modal>
    </>
  );
}
