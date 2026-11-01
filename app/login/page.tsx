
"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState("");

  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] =
    useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/");
      } else {
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // =========================================
  // LOGIN
  // =========================================

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setError("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);

      await signInWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      router.replace("/");
    } catch (err: unknown) {
      console.error(err);

      let message = "Unable to login. Please try again.";

      if (err instanceof Error) {
        message = err.message;
      }

      if (
        message.includes("auth/invalid-credential") ||
        message.includes("auth/wrong-password") ||
        message.includes("auth/user-not-found")
      ) {
        message = "Invalid email or password.";
      } else if (message.includes("auth/invalid-email")) {
        message = "Please enter a valid email address.";
      } else if (message.includes("auth/too-many-requests")) {
        message =
          "Too many login attempts. Please try again later.";
      } else if (
        message.includes("auth/network-request-failed")
      ) {
        message =
          "Network error. Please check your internet connection.";
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // =========================================
  // OPEN FORGOT PASSWORD
  // =========================================

  function openForgotPassword() {
    setResetEmail(email.trim());
    setResetError("");
    setResetSuccess(false);
    setShowForgotPassword(true);
  }

  // =========================================
  // SEND PASSWORD RESET EMAIL
  // =========================================

  async function handlePasswordReset(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (resetLoading) return;

    setResetError("");
    setResetSuccess(false);

    const cleanEmail = resetEmail.trim();

    if (!cleanEmail) {
      setResetError("Please enter your registered email.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setResetError("Please enter a valid email address.");
      return;
    }

    try {
      setResetLoading(true);

      await sendPasswordResetEmail(auth, cleanEmail);

      setResetSuccess(true);
    } catch (err: unknown) {
      console.error("Password reset failed:", err);

      let message =
        "Unable to process your request. Please try again.";

      if (err instanceof Error) {
        if (err.message.includes("auth/invalid-email")) {
          message = "Please enter a valid email address.";
        } else if (
          err.message.includes("auth/too-many-requests")
        ) {
          message =
            "Too many requests. Please try again later.";
        } else if (
          err.message.includes("auth/network-request-failed")
        ) {
          message =
            "Network error. Please check your internet connection.";
        }
      }

      setResetError(message);
    } finally {
      setResetLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-slate-500">
          Checking account...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-5 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-md">

        {/* HEADER */}

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight">
            Welcome Back
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Login to your TOURNEX account
          </p>
        </div>

        {/* LOGIN CARD */}

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >

            {/* EMAIL */}

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="Enter your email"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-900 focus:bg-white"
                required
              />
            </div>

            {/* PASSWORD */}

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-900 focus:bg-white"
                required
              />
            </div>

            {/* FORGOT PASSWORD */}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={openForgotPassword}
                className="text-xs font-bold text-slate-700 transition hover:text-black hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            {/* ERROR */}

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            {/* LOGIN BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-slate-900 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          {/* SIGNUP */}

          <div className="mt-6 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}

            <button
              type="button"
              onClick={() => router.push("/signup")}
              className="font-bold text-slate-900 hover:underline"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>

      {/* =========================================
          FORGOT PASSWORD MODAL
      ========================================= */}

      {showForgotPassword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
            className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl"
          >

            {/* MODAL HEADER */}

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="reset-password-title"
                  className="text-[22px] font-black text-slate-900"
                >
                  Reset Password
                </h2>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Enter your registered email address.
                  We&apos;ll send you a link to reset
                  your password.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                aria-label="Close password reset"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl font-bold text-slate-700"
              >
                ×
              </button>
            </div>

            {/* RESET SUCCESS */}

            {resetSuccess ? (
              <div className="mt-6">

                <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">

                  <div className="text-4xl">
                    ✉️
                  </div>

                  <h3 className="mt-3 text-lg font-black text-green-800">
                    Request Submitted!
                  </h3>

                  <p className="mt-2 text-xs leading-5 text-green-700">
                    If an account exists for this email,
                    a password reset link will be sent.
                    Please check your inbox and spam folder.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="mt-5 h-12 w-full rounded-xl bg-slate-900 text-sm font-black text-white"
                >
                  Back to Login
                </button>
              </div>
            ) : (

              /* RESET FORM */

              <form
                onSubmit={handlePasswordReset}
                className="mt-6 space-y-4"
              >

                <div>
                  <label
                    htmlFor="resetEmail"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Registered Email
                  </label>

                  <input
                    id="resetEmail"
                    type="email"
                    value={resetEmail}
                    onChange={(event) =>
                      setResetEmail(event.target.value)
                    }
                    placeholder="Enter your registered email"
                    autoComplete="email"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-900 focus:bg-white"
                    required
                  />
                </div>

                {/* RESET ERROR */}

                {resetError && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600">
                    {resetError}
                  </div>
                )}

                {/* SEND LINK */}

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="h-12 w-full rounded-xl bg-[#FFD600] text-sm font-black text-black transition hover:bg-[#f0c900] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resetLoading
                    ? "Sending Request..."
                    : "Send Reset Link"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="h-11 w-full rounded-xl border border-slate-200 text-xs font-bold text-slate-500"
                >
                  Cancel
                </button>

              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
