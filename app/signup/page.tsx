"use client";

import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";

/* =================================================
   PLAYER AVATARS
================================================= */

const PLAYER_AVATARS = [
  {
    id: "raphinha",
    name: "Raphinha",
    image: "/player-avatars/raphinha.png",
  },
  {
    id: "ronaldinho",
    name: "Ronaldinho",
    image: "/player-avatars/ronaldinho.png",
  },
  {
    id: "ronaldo",
    name: "Ronaldo",
    image: "/player-avatars/ronaldo.png",
  },
  {
    id: "coutinho",
    name: "Coutinho",
    image: "/player-avatars/coutinho.png",
  },
  {
    id: "yamal",
    name: "Yamal",
    image: "/player-avatars/yamal.png",
  },
  {
    id: "beckham",
    name: "Beckham",
    image: "/player-avatars/beckham.png",
  },
  {
    id: "di-maria",
    name: "Di Maria",
    image: "/player-avatars/di-maria.png",
  },
  {
    id: "dybala",
    name: "Dybala",
    image: "/player-avatars/dybala.png",
  },
  {
    id: "messi",
    name: "Messi",
    image: "/player-avatars/messi.png",
  },
  {
    id: "neymar",
    name: "Neymar",
    image: "/player-avatars/neymar.png",
  },
];

/* =================================================
   SIGNUP PAGE
================================================= */

export default function SignupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [selectedAvatar, setSelectedAvatar] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* =================================================
     SUBMIT
  ================================================= */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setSuccess("");

    const cleanUsername = username.trim();
    const cleanPhoneNumber = phoneNumber.trim();
    const cleanEmail = email.trim();

    if (!cleanUsername) {
      setError("Please enter your eFootball username.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhoneNumber)) {
  setError("Please enter a valid 10-digit Indian phone number.");
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

      /* CREATE FIREBASE AUTH ACCOUNT */

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      const user = userCredential.user;

      /* CREATE FIRESTORE USER */

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: cleanEmail,
        phoneNumber: cleanPhoneNumber,
        username: cleanUsername,

        // Local avatar path
        profilePhoto: selectedAvatar,

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

  /* =================================================
     UI
  ================================================= */

  return (
    <main className="min-h-screen bg-[#eeeeee] px-5 py-8 text-[#111111]">
      <div className="mx-auto w-full max-w-md">

        {/* HEADER */}

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black tracking-tight">
            Create Account
          </h1>

          <p className="mt-2 text-sm text-[#777777]">
            Join the eFootball Tournament
          </p>
        </div>

        {/* SIGNUP CARD */}

        <div className="rounded-[26px] border border-[#dddddd] bg-white p-5 shadow-sm">

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* =========================================
                AVATAR SELECTOR
            ========================================= */}

            <div>
              <div className="mb-4 text-center">
                <h2 className="text-[18px] font-black">
                  Choose Your Player
                </h2>

                <p className="mt-1 text-xs text-[#888888]">
                  Select a profile avatar
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">

                {PLAYER_AVATARS.map((avatar) => {
                  const selected =
                    selectedAvatar === avatar.image;

                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => {
                        setSelectedAvatar(avatar.image);
                        setError("");
                      }}
                      className={`relative overflow-hidden rounded-[18px] border-[3px] bg-[#f3f3f3] transition active:scale-[0.97] ${
                        selected
                          ? "border-[#FFD600]"
                          : "border-transparent"
                      }`}
                    >
                      {/* IMAGE */}

                      <div className="aspect-square w-full overflow-hidden">
                        <img
                          src={avatar.image}
                          alt={avatar.name}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      {/* NAME */}

                      <div
                        className={`px-1 py-2 text-center text-[10px] font-black ${
                          selected
                            ? "bg-[#FFD600] text-black"
                            : "bg-[#111111] text-white"
                        }`}
                      >
                        {avatar.name}
                      </div>

                      {/* SELECTED CHECK */}

                      {selected && (
                        <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFD600] text-[13px] font-black text-black shadow">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}

              </div>

              {/* OPTIONAL AVATAR */}

              <button
                type="button"
                onClick={() => {
                  setSelectedAvatar("");
                  setError("");
                }}
                className={`mt-3 h-11 w-full rounded-xl border text-xs font-black transition ${
                  selectedAvatar === ""
                    ? "border-[#FFD600] bg-[#fff9d6] text-black"
                    : "border-[#dddddd] bg-white text-[#777777]"
                }`}
              >
                Continue Without Avatar
              </button>

              {/* SELECTED AVATAR PREVIEW */}

              {selectedAvatar && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#111111] p-3">

                  <img
                    src={selectedAvatar}
                    alt="Selected avatar"
                    className="h-12 w-12 rounded-full border-2 border-[#FFD600] object-cover"
                  />

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888]">
                      Selected Avatar
                    </p>

                    <p className="mt-0.5 text-sm font-black text-white">
                      {
                        PLAYER_AVATARS.find(
                          (avatar) =>
                            avatar.image === selectedAvatar
                        )?.name
                      }
                    </p>
                  </div>

                  <div className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#FFD600] text-xs font-black text-black">
                    ✓
                  </div>

                </div>
              )}
            </div>

            {/* =========================================
                EFOOTBALL USERNAME
            ========================================= */}

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
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                placeholder="Enter your eFootball username"
                autoComplete="username"
                className="h-12 w-full rounded-xl border border-[#dddddd] bg-[#f7f7f7] px-4 text-sm outline-none transition focus:border-[#FFD600] focus:bg-white"
                required
              />
            </div>

            {/* =========================================
    PHONE NUMBER
========================================= */}

<div>
  <label
    htmlFor="phoneNumber"
    className="mb-2 block text-sm font-semibold"
  >
    Phone Number
  </label>

  <input
    id="phoneNumber"
    type="tel"
    inputMode="numeric"
    value={phoneNumber}
    onChange={(event) => {
      const value = event.target.value
        .replace(/\D/g, "")
        .slice(0, 10);

      setPhoneNumber(value);
    }}
    placeholder="Enter your 10-digit phone number"
    autoComplete="tel-national"
    maxLength={10}
    pattern="[6-9][0-9]{9}"
    className="h-12 w-full rounded-xl border border-[#dddddd] bg-[#f7f7f7] px-4 text-sm outline-none transition focus:border-[#FFD600] focus:bg-white"
    required
  />

  <p className="mt-2 text-xs text-[#999999]">
    Enter your 10-digit mobile number
  </p>
</div>

            {/* =========================================
                EMAIL
            ========================================= */}

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
                className="h-12 w-full rounded-xl border border-[#dddddd] bg-[#f7f7f7] px-4 text-sm outline-none transition focus:border-[#FFD600] focus:bg-white"
                required
              />
            </div>

            {/* =========================================
                PASSWORD
            ========================================= */}

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
                placeholder="Create a password"
                autoComplete="new-password"
                className="h-12 w-full rounded-xl border border-[#dddddd] bg-[#f7f7f7] px-4 text-sm outline-none transition focus:border-[#FFD600] focus:bg-white"
                required
                minLength={6}
              />

              <p className="mt-2 text-xs text-[#999999]">
                Minimum 6 characters
              </p>
            </div>

            {/* ERROR */}

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            {/* SUCCESS */}

            {success && (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-600">
                {success}
              </div>
            )}

            {/* SUBMIT */}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#111111] text-sm font-black text-[#FFD600] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Creating account..."
                : "Create Account"}
            </button>

          </form>

          {/* LOGIN */}

          <div className="mt-6 text-center text-sm text-[#777777]">
            Already have an account?{" "}

            <button
              type="button"
              onClick={() =>
                router.push("/login")
              }
              className="font-black text-[#111111] hover:underline"
            >
              Login
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}