"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  addDoc,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

type Tournament = {
  id: string;
  coins: number;
  entryFee: number;
  registeredPlayers: number;
  maxPlayers: number;
  category: string;
  date: string;
  time: string;
  status: string;
  roomCode?: string;
  roomCodeA?: string;
  roomCodeB?: string;
  finalRoomCode?: string;
};

type UserProfile = {
  uid: string;
  username: string;
  konamiId: string;
  email: string;
  profilePhoto?: string;
};

function getTournamentImage(coins: number) {
  return `/images/${coins}.png`;
}

/* --------------------------------
   Generate 6 Character Join Code
--------------------------------- */

function generateJoinCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const randomValues = new Uint32Array(length);

  crypto.getRandomValues(randomValues);

  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars[randomValues[i] % chars.length];
  }

  return code;
}

function JoinTournamentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tournamentId =
    searchParams.get("tournamentId") ||
    searchParams.get("tournament");

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [userProfile, setUserProfile] =
    useState<UserProfile | null>(null);

  const [tournament, setTournament] =
    useState<Tournament | null>(null);

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const [error, setError] = useState("");
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  /* --------------------------------
     Auth Listener
  --------------------------------- */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setAuthUser(user);
        setAuthLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* --------------------------------
     Load Tournament + User Profile
  --------------------------------- */

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      setLoading(false);
      return;
    }

    if (!tournamentId) {
      setLoading(false);
      setError("Tournament not found.");
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        /* --------------------------------
           Tournament
        --------------------------------- */

        const tournamentRef = doc(
          db,
          "tournaments",
          tournamentId
        );

        const tournamentSnap = await getDoc(
          tournamentRef
        );

        if (!tournamentSnap.exists()) {
          setError("Tournament not found.");
          setTournament(null);
          return;
        }

        const tournamentData =
          tournamentSnap.data();

        setTournament({
          id: tournamentSnap.id,

          coins: Number(
            tournamentData.coins || 0
          ),

          entryFee: Number(
            tournamentData.entryFee || 0
          ),

          registeredPlayers: Number(
            tournamentData.registeredPlayers || 0
          ),

          maxPlayers: Number(
            tournamentData.maxPlayers || 0
          ),

          category: String(
            tournamentData.category || ""
          ),

          date: String(
            tournamentData.date || ""
          ),

          time: String(
            tournamentData.time || ""
          ),

          status: String(
            tournamentData.status || ""
          ),

          roomCode:
            tournamentData.roomCode,

          roomCodeA:
            tournamentData.roomCodeA,

          roomCodeB:
            tournamentData.roomCodeB,

          finalRoomCode:
            tournamentData.finalRoomCode,
        });

        /* --------------------------------
           User Profile
        --------------------------------- */

        const userRef = doc(
          db,
          "users",
          authUser.uid
        );

        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setError("User profile not found.");
          setUserProfile(null);
          return;
        }

        const userData =
          userSnap.data();

        setUserProfile({
          uid: authUser.uid,

          username: String(
            userData.username || ""
          ),

          konamiId: String(
            userData.konamiId || ""
          ),

          email: String(
            userData.email ||
              authUser.email ||
              ""
          ),

          profilePhoto:
            userData.profilePhoto || "",
        });

        /* --------------------------------
           Check Existing Registration
        --------------------------------- */

        const registrationQuery =
          query(
            collection(
              db,
              "tournamentRegistrations"
            ),
            where(
              "tournamentId",
              "==",
              tournamentId
            ),
            where(
              "userId",
              "==",
              authUser.uid
            )
          );

        const registrationSnapshot =
          await getDocs(
            registrationQuery
          );

        /*
         * Only CONFIRMED registration
         * should show "Already Booked".
         *
         * Pending registration can continue
         * to Verify page.
         */

        const confirmedRegistration =
          registrationSnapshot.docs.find(
            (registrationDoc) => {
              const data =
                registrationDoc.data();

              return (
                data.status === "confirmed"
              );
            }
          );

        setAlreadyJoined(
          !!confirmedRegistration
        );
      } catch (err) {
        console.error(err);

        setError(
          "Something went wrong while loading tournament."
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [
    authUser,
    authLoading,
    tournamentId,
  ]);

  /* --------------------------------
     Handle Join
  --------------------------------- */

  const handleJoin = async () => {
    if (joining) return;

    if (!authUser) {
      setError("Please login first.");
      return;
    }

    if (!userProfile) {
      setError("User profile not found.");
      return;
    }

    if (!tournament) {
      setError("Tournament not found.");
      return;
    }

    try {
      setJoining(true);
      setError("");

      /* --------------------------------
         Tournament Status
      --------------------------------- */

      const currentStatus =
        tournament.status.toLowerCase();

      if (
        currentStatus === "cancelled" ||
        currentStatus === "completed" ||
        currentStatus === "closed"
      ) {
        setError(
          "This tournament is no longer available."
        );

        return;
      }

      /* --------------------------------
         Full Check
      --------------------------------- */

      if (
        tournament.registeredPlayers >=
        tournament.maxPlayers
      ) {
        setError(
          "This tournament is already full."
        );

        return;
      }

      /* --------------------------------
         Check Existing Registration
      --------------------------------- */

      const existingQuery =
        query(
          collection(
            db,
            "tournamentRegistrations"
          ),
          where(
            "tournamentId",
            "==",
            tournament.id
          ),
          where(
            "userId",
            "==",
            authUser.uid
          )
        );

      const existingSnapshot =
        await getDocs(
          existingQuery
        );

      /*
       * If confirmed:
       * Don't allow another booking.
       */

      const confirmedRegistration =
        existingSnapshot.docs.find(
          (registrationDoc) => {
            const data =
              registrationDoc.data();

            return (
              data.status === "confirmed"
            );
          }
        );

      if (confirmedRegistration) {
        setAlreadyJoined(true);

        setError(
          "You already have a confirmed booking for this tournament."
        );

        return;
      }

      /*
       * If pending:
       * Continue to the existing Verify page.
       */

      const pendingRegistration =
        existingSnapshot.docs.find(
          (registrationDoc) => {
            const data =
              registrationDoc.data();

            return (
              data.status === "pending"
            );
          }
        );

      if (pendingRegistration) {
        router.push(
          `/tournament/verify?bookingId=${encodeURIComponent(
            pendingRegistration.id
          )}`
        );

        return;
      }

      /* --------------------------------
         Generate Join Code
      --------------------------------- */

      const joinCode =
        generateJoinCode(6);

      /* --------------------------------
         Create Pending Registration
      --------------------------------- */

      const registrationRef =
        await addDoc(
          collection(
            db,
            "tournamentRegistrations"
          ),
          {
            tournamentId:
              tournament.id,

            userId:
              authUser.uid,

            username:
              userProfile.username,

            profilePhoto:
              userProfile.profilePhoto ||
              "",

            konamiId:
              userProfile.konamiId,

            email:
              userProfile.email,

            tournamentPoints:
              tournament.coins,

            category:
              tournament.category,

            date:
              tournament.date,

            time:
              tournament.time,

            entryFee:
              tournament.entryFee,

            rewardCoins:
              tournament.coins,

            /* Booking starts as pending */

            status:
              "pending",

            paymentStatus:
              "pending",

            /* Verification code */

            joinCode:
              joinCode,

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          }
        );

      /* --------------------------------
         Go To Verify Page
      --------------------------------- */

      router.push(
        `/tournament/verify?bookingId=${encodeURIComponent(
          registrationRef.id
        )}`
      );
    } catch (err) {
      console.error(err);

      setError(
        "Unable to create your booking. Please try again."
      );
    } finally {
      setJoining(false);
    }
  };

  /* --------------------------------
     Loading
  --------------------------------- */

  if (authLoading || loading) {
    return (
      <PageFrame>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-sm text-white/60">
            Loading tournament...
          </div>
        </div>
      </PageFrame>
    );
  }

  /* --------------------------------
     Login Required
  --------------------------------- */

  if (!authUser) {
    return (
      <PageFrame>
        <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4">
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <h2 className="text-xl font-semibold text-white">
              Login Required
            </h2>

            <p className="mt-2 text-sm text-white/60">
              Please login to join this tournament.
            </p>

            <button
              onClick={() =>
                router.push("/login")
              }
              className="mt-6 w-full rounded-xl bg-white px-4 py-3 font-semibold text-black transition hover:bg-white/90"
            >
              Login
            </button>
          </div>
        </div>
      </PageFrame>
    );
  }

  /* --------------------------------
     Missing Data
  --------------------------------- */

  if (!tournament || !userProfile) {
    return (
      <PageFrame>
        <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4">
          <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
            <h2 className="text-xl font-semibold text-white">
              Unable to Load
            </h2>

            <p className="mt-2 text-sm text-white/60">
              {error ||
                "Something went wrong."}
            </p>
          </div>
        </div>
      </PageFrame>
    );
  }

  const isFull =
    tournament.registeredPlayers >=
    tournament.maxPlayers;

  const isClosed =
    tournament.status.toLowerCase() ===
      "cancelled" ||
    tournament.status.toLowerCase() ===
      "completed" ||
    tournament.status.toLowerCase() ===
      "closed";

  return (
    <PageFrame>
      <div className="mx-auto max-w-3xl px-4 py-6">

        {/* --------------------------------
            Header
        --------------------------------- */}

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            Join Tournament
          </h1>

          <p className="mt-1 text-sm text-white/50">
            Confirm your details and reserve
            your tournament booking.
          </p>
        </div>

        {/* --------------------------------
            Tournament Image
        --------------------------------- */}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <img
            src={getTournamentImage(
              tournament.coins
            )}
            alt={`${tournament.coins} Coins Tournament`}
            className="h-56 w-full object-cover"
          />
        </div>

        {/* --------------------------------
            Tournament Info
        --------------------------------- */}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/40">
                Tournament
              </p>

              <h2 className="mt-1 text-xl font-semibold text-white">
                {tournament.coins} Coins
              </h2>
            </div>

            <div className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white">
              {tournament.category}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">

            <InfoItem
              label="Time"
              value={tournament.time}
            />

            <InfoItem
              label="Date"
              value={tournament.date}
            />

            <InfoItem
              label="Entry Fee"
              value={`₹${tournament.entryFee}`}
            />

            <InfoItem
              label="Players"
              value={`${tournament.registeredPlayers}/${tournament.maxPlayers}`}
            />

          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-wider text-white/40">
              Prize
            </p>

            <p className="mt-1 text-lg font-semibold text-white">
              {tournament.coins} eFootball Coins
            </p>
          </div>
        </div>

        {/* --------------------------------
            Profile
        --------------------------------- */}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-sm font-semibold text-white">
            Your Profile
          </h3>

          <div className="mt-4 flex items-center gap-4">

            {userProfile.profilePhoto ? (
              <img
                src={
                  userProfile.profilePhoto
                }
                alt={
                  userProfile.username
                }
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white">
                {userProfile.username
                  ?.charAt(0)
                  ?.toUpperCase() ||
                  "U"}
              </div>
            )}

            <div>
              <p className="font-medium text-white">
                {userProfile.username}
              </p>

              <p className="mt-1 text-sm text-white/50">
                Konami ID:{" "}
                {userProfile.konamiId}
              </p>
            </div>

          </div>
        </div>

        {/* --------------------------------
            Rules
        --------------------------------- */}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h3 className="text-sm font-semibold text-white">
            Before You Join
          </h3>

          <div className="mt-4 space-y-3">

            <JoinRule>
              Make sure your eFootball username
              is correct.
            </JoinRule>

            <JoinRule>
              Your tournament slot will be
              reserved after payment verification.
            </JoinRule>

            <JoinRule>
              Room details will be provided
              according to the tournament schedule.
            </JoinRule>

            <JoinRule>
              You must be available at the
              scheduled tournament time.
            </JoinRule>

          </div>
        </div>

        {/* --------------------------------
            Error
        --------------------------------- */}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-300">
              {error}
            </p>
          </div>
        )}

        {/* --------------------------------
            Already Joined
        --------------------------------- */}

        {alreadyJoined && (
          <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-300">
              You already have a confirmed
              booking for this tournament.
            </p>
          </div>
        )}

        {/* --------------------------------
            Join Button
        --------------------------------- */}

        <button
          onClick={handleJoin}
          disabled={
            joining ||
            alreadyJoined ||
            isFull ||
            isClosed
          }
          className="mt-5 w-full rounded-2xl bg-white px-5 py-4 text-sm font-bold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {joining
            ? "Creating Booking..."
            : isFull
            ? "Tournament Full"
            : isClosed
            ? "Tournament Closed"
            : alreadyJoined
            ? "Already Booked"
            : `Confirm & Join • ₹${tournament.entryFee}`}
        </button>

        <p className="mt-3 text-center text-xs text-white/40">
          After clicking, you will be taken to
          the verification page.
        </p>

      </div>
    </PageFrame>
  );
}

/* --------------------------------
   Page Frame
--------------------------------- */

function PageFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-black text-white">

      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4">
          <h1 className="text-lg font-semibold">
            Tournament
          </h1>
        </div>
      </header>

      {children}

    </main>
  );
}

/* --------------------------------
   Info Item
--------------------------------- */

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">

      <p className="text-xs text-white/40">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-white">
        {value}
      </p>

    </div>
  );
}

/* --------------------------------
   Join Rule
--------------------------------- */

function JoinRule({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">

      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-white/70" />

      <p className="text-sm leading-6 text-white/60">
        {children}
      </p>

    </div>
  );
}

/* --------------------------------
   Page
--------------------------------- */

export default function JoinTournamentPage() {
  return (
    <Suspense
      fallback={
        <PageFrame>
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="text-sm text-white/60">
              Loading...
            </div>
          </div>
        </PageFrame>
      }
    >
      <JoinTournamentContent />
    </Suspense>
  );
}