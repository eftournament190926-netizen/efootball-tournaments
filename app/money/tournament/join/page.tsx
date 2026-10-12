
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Tournament = {
  id: string;
  entryFee: number;
  registeredPlayers: number;
  maxPlayers: number;
  category: string;
  date: string;
  time: string;
  status: string;
  cashPrize: number;
};

type Profile = {
  username: string;
  konamiId: string;
  email: string;
  profilePhoto: string;
};

function MoneyJoinContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tournamentId = params.get("tournamentId");

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [balance, setBalance] = useState(0);
  const [tournament, setTournament] =
    useState<Tournament | null>(null);
  const [profile, setProfile] =
    useState<Profile | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!user || !tournamentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [tSnap, uSnap, rSnap] = await Promise.all([
          getDoc(doc(db, "moneyTournaments", tournamentId!)),
          getDoc(doc(db, "users", user!.uid)),
          getDoc(
            doc(
              db,
              "moneyTournamentRegistrations",
              `${tournamentId}_${user!.uid}`
            )
          ),
        ]);

        if (!tSnap.exists()) {
          throw new Error("Tournament not found.");
        }

        if (!uSnap.exists()) {
          throw new Error("User profile not found.");
        }

        const t = tSnap.data();
        const u = uSnap.data();

        if (cancelled) return;

        setTournament({
          id: tSnap.id,
          entryFee: Number(t.entryFee ?? 0),
          registeredPlayers: Number(t.registeredPlayers ?? 0),
          maxPlayers: Number(t.maxPlayers ?? 0),
          category: String(t.category ?? ""),
          date: String(t.date ?? ""),
          time: String(t.time ?? ""),
          status: String(t.status ?? "upcoming"),
          cashPrize: Number(t.cashPrize ?? 0),
        });

        setProfile({
          username: String(u.username ?? ""),
          konamiId: String(u.konamiId ?? ""),
          email: String(u.email ?? user!.email ?? ""),
          profilePhoto: String(u.profilePhoto ?? ""),
        });

        setBalance(Number(u.pointsBalance ?? 0));
        setAlreadyJoined(rSnap.exists());
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load tournament."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [authReady, user, tournamentId]);

  async function handleJoin() {
    if (joining || !user || !tournament || !profile) return;

    setJoining(true);
    setError("");

    try {
      const result = await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", user.uid);
        const tournamentRef = doc(
          db,
          "moneyTournaments",
          tournament.id
        );
        const registrationRef = doc(
          db,
          "moneyTournamentRegistrations",
          `${tournament.id}_${user.uid}`
        );

        // All reads must happen before writes.
        const [userSnap, tournamentSnap, registrationSnap] =
          await Promise.all([
            tx.get(userRef),
            tx.get(tournamentRef),
            tx.get(registrationRef),
          ]);

        if (!userSnap.exists() || !tournamentSnap.exists()) {
          throw new Error("Account or tournament not found.");
        }

        if (registrationSnap.exists()) {
          throw new Error("You have already joined this tournament.");
        }

        const u = userSnap.data();
        const t = tournamentSnap.data();

        const points = Number(u.pointsBalance ?? 0);
        const fee = Number(t.entryFee ?? 0);
        const registered = Number(t.registeredPlayers ?? 0);
        const maximum = Number(t.maxPlayers ?? 0);
        const status = String(t.status ?? "").toLowerCase();

        if (
          !Number.isSafeInteger(points) ||
          points < 0 ||
          !Number.isSafeInteger(fee) ||
          fee < 10 ||
          fee > 100
        ) {
          throw new Error("Invalid wallet or entry fee.");
        }

        if (status !== "upcoming") {
          throw new Error("Tournament registration is closed.");
        }

        if (
          !Number.isSafeInteger(registered) ||
          !Number.isSafeInteger(maximum) ||
          maximum <= 0 ||
          registered >= maximum
        ) {
          throw new Error("Tournament is full.");
        }

        if (points < fee) {
          throw new Error("INSUFFICIENT_POINTS");
        }

        const newBalance = points - fee;

        tx.update(userRef, {
          pointsBalance: newBalance,
        });

        tx.update(tournamentRef, {
          registeredPlayers: registered + 1,
        });

        tx.set(registrationRef, {
          tournamentId: tournament.id,
          userId: user.uid,
          username: String(u.username ?? ""),
          konamiId: String(u.konamiId ?? ""),
          email: String(u.email ?? user.email ?? ""),
          profilePhoto: String(u.profilePhoto ?? ""),
          category: String(t.category ?? ""),
          date: String(t.date ?? ""),
          time: String(t.time ?? ""),
          entryFee: fee,
          cashPrize: Number(t.cashPrize ?? 0),
          status: "confirmed",
          paymentStatus: "paid",
          paymentMethod: "points",
          pointsDeducted: fee,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        return newBalance;
      });

      setBalance(result);
      setAlreadyJoined(true);

      window.alert("Tournament joined successfully!");
      router.push("/money");
    } catch (err) {
      console.error("Money tournament join failed:", err);

      const message =
        err instanceof Error ? err.message : "Unable to join.";

      setError(
        message === "INSUFFICIENT_POINTS"
          ? "Insufficient Points. Please add Points to your wallet."
          : message
      );
    } finally {
      setJoining(false);
    }
  }

  const isFull =
    !!tournament &&
    tournament.registeredPlayers >= tournament.maxPlayers;

  const isClosed =
    !!tournament &&
    tournament.status.toLowerCase() !== "upcoming";

  const insufficientPoints =
    !!tournament && balance < tournament.entryFee;

  return (
    <main className="min-h-screen bg-[#f2f2f2] text-[#111111]">
      <header className="bg-[#FFD600] px-5 py-5">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <button
            onClick={() => router.back()}
            className="font-black"
          >
            ← BACK
          </button>
          <h1 className="text-lg font-black">
            MONEY TOURNAMENT
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 py-6">
        {!authReady || loading ? (
          <p className="py-16 text-center font-bold">
            Loading...
          </p>
        ) : !user ? (
          <div className="rounded-2xl bg-white p-6 text-center">
            <h2 className="text-xl font-black">Login Required</h2>
            <button
              onClick={() =>
                router.push(
                  `/login?redirect=${encodeURIComponent(
                    `/money/tournament/join?tournamentId=${tournamentId ?? ""}`
                  )}`
                )
              }
              className="mt-5 rounded-xl bg-[#FFD600] px-6 py-3 font-black"
            >
              LOGIN
            </button>
          </div>
        ) : tournament && profile ? (
          <>
            <div className="rounded-2xl bg-[#111111] p-5 text-white">
              <p className="text-xs font-bold text-[#FFD600]">
                AVAILABLE POINTS
              </p>
              <p className="mt-2 text-4xl font-black">
                {balance} P
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">
                Tournament Details
              </h2>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Entry Fee</span>
                  <strong>{tournament.entryFee} P</strong>
                </div>
                <div className="flex justify-between">
                  <span>Winner Prize</span>
                  <strong>₹{tournament.cashPrize}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Players</span>
                  <strong>
                    {tournament.registeredPlayers}/
                    {tournament.maxPlayers}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Date</span>
                  <strong>{tournament.date}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Time</span>
                  <strong>{tournament.time}</strong>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="font-black">Your Profile</h2>
              <div className="mt-3 flex items-center gap-3">
                {profile.profilePhoto ? (
                  <img
                    src={profile.profilePhoto}
                    alt="Profile"
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFD600] font-black">
                    {profile.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-black">{profile.username}</p>
                  <p className="text-xs text-gray-500">
                    Konami ID: {profile.konamiId}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-[#fff8d6] p-4 text-sm">
              <strong>Before You Join</strong>
              <p className="mt-2">
                {tournament.entryFee} Points will be deducted
                immediately after confirmation.
              </p>
              <p className="mt-2">
                Converted or purchased Points cannot be
                withdrawn as cash.
              </p>
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-600">
                {error}
              </p>
            )}

            {insufficientPoints && !alreadyJoined && (
              <button
                onClick={() => router.push("/money")}
                className="w-full rounded-xl border-2 border-[#FFD600] bg-white py-4 font-black"
              >
                + ADD POINTS
              </button>
            )}

            <button
              onClick={handleJoin}
              disabled={
                joining ||
                alreadyJoined ||
                isFull ||
                isClosed ||
                insufficientPoints
              }
              className="w-full rounded-xl bg-[#FFD600] py-4 text-base font-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {joining
                ? "JOINING..."
                : alreadyJoined
                  ? "ALREADY JOINED"
                  : isFull
                    ? "TOURNAMENT FULL"
                    : isClosed
                      ? "REGISTRATION CLOSED"
                      : insufficientPoints
                        ? "INSUFFICIENT POINTS"
                        : `CONFIRM & JOIN • ${tournament.entryFee} P`}
            </button>
          </>
        ) : (
          <p className="rounded-xl bg-white p-5 text-center text-red-600">
            {error || "Tournament unavailable."}
          </p>
        )}
      </div>
    </main>
  );
}

export default function MoneyJoinPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MoneyJoinContent />
    </Suspense>
  );
}
