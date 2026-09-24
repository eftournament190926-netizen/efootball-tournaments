"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";

export default function SignupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [konamiId, setKonamiId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photo must be less than 5MB.");
      return;
    }

    setError("");
    setProfilePhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  async function uploadProfilePhoto(file: File) {
    const cloudName =
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "";

    const uploadPreset =
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

    if (!cloudName || !uploadPreset) {
      throw new Error("Cloudinary configuration is missing.");
    }

    const formData = new FormData();

    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message || "Profile photo upload failed."
      );
    }

    return data.secure_url as string;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    const cleanUsername = username.trim();
    const cleanKonamiId = konamiId.trim();
    const cleanEmail = email.trim();

    if (!profilePhoto) {
      setError("Please select a profile photo.");
      return;
    }

    if (!cleanUsername) {
      setError("Please enter your eFootball username.");
      return;
    }

    if (!cleanKonamiId) {
      setError("Please enter your Konami ID.");
      return;
    }

    if (!cleanEmail) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    try {
      setLoading(true);

      // Create Firebase Authentication account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      const user = userCredential.user;

      // Upload profile photo to Cloudinary
      const profilePhotoUrl = await uploadProfilePhoto(profilePhoto);

      // Create Firestore user document
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: cleanEmail,
        konamiId: cleanKonamiId,
        username: cleanUsername,
        profilePhoto: profilePhotoUrl,

        tournamentStats: {
  matches: 0,
  wins: 0,
  losses: 0,
  goals: 0,
  conceded: 0,
  tournamentPlayed: 0,
  tournamentWon: 0,
  tournamentRunner: 0,
},

        divisionStats: {
          matches: 0,
          wins: 0,
          losses: 0,
          goals: 0,
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccess("Account created successfully!");

      setTimeout(() => {
        router.push("/");
      }, 1000);
    } catch (err: unknown) {
      console.error(err);

      let message = "Something went wrong. Please try again.";

      if (err instanceof Error) {
        message = err.message;
      }

      if (message.includes("auth/email-already-in-use")) {
        message = "This email is already registered.";
      } else if (message.includes("auth/invalid-email")) {
        message = "Please enter a valid email address.";
      } else if (message.includes("auth/weak-password")) {
        message = "Password is too weak.";
      } else if (message.includes("auth/network-request-failed")) {
        message = "Network error. Please check your internet connection.";
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-5 py-8 text-slate-900">
      <div className="mx-auto w-full max-w-md">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight">
            Create Account
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Join the eFootball Tournament
          </p>
        </div>

        {/* Signup Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Profile Photo */}
            <div className="flex flex-col items-center">
              <label
                htmlFor="profilePhoto"
                className="group relative cursor-pointer"
              >
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-slate-100 bg-slate-100">

                  {preview ? (
                    <img
                      src={preview}
                      alt="Profile preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <svg
                      width="42"
                      height="42"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="text-slate-400"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>

                <div className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow">
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </div>
              </label>

              <input
                id="profilePhoto"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
              />

              <p className="mt-3 text-xs text-slate-500">
                Add profile photo
              </p>
            </div>

            {/* eFootball Username */}
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-semibold"
              >
                eFootball Username
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter your eFootball username"
                autoComplete="username"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-900 focus:bg-white"
                required
              />
            </div>

            {/* Konami ID */}
            <div>
              <label
                htmlFor="konamiId"
                className="mb-2 block text-sm font-semibold"
              >
                Konami ID
              </label>

              <input
                id="konamiId"
                type="text"
                value={konamiId}
                onChange={(event) => setKonamiId(event.target.value)}
                placeholder="Enter your User ID"
                autoComplete="off"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-900 focus:bg-white"
                required
              />
            </div>

            {/* Email */}
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
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-900 focus:bg-white"
                required
              />
            </div>

            {/* Password */}
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
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a password"
                autoComplete="new-password"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-900 focus:bg-white"
                required
                minLength={6}
              />

              <p className="mt-2 text-xs text-slate-400">
                Minimum 6 characters
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-600">
                {success}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-slate-900 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          {/* Login */}
          <div className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="font-bold text-slate-900 hover:underline"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}