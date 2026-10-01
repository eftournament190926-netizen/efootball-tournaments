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
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-[4px] border-[#dddddd] border-t-[#FFD600]" />

          <div className="mt-3 text-sm font-semibold text-[#666666]">
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
          <div className="w-full overflow-hidden rounded-[22px] border border-[#dedede] bg-white shadow-[0_8px_25px_rgba(0,0,0,0.06)]">
            <div className="h-[6px] bg-[#FFD600]" />

            <div className="p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFD600] text-2xl">
                🔐
              </div>

              <h2 className="mt-4 text-xl font-black text-[#111111]">
                Login Required
              </h2>

              <p className="mt-2 text-sm text-[#666666]">
                Please login to join this tournament.
              </p>

              <button
                onClick={() =>
                  router.push("/login")
                }
                className="mt-6 w-full rounded-xl bg-[#FFD600] px-4 py-3 font-black text-[#111111] transition hover:bg-[#111111] hover:text-[#FFD600]"
              >
                Login
              </button>
            </div>
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
          <div className="w-full rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <h2 className="text-xl font-bold text-[#111111]">
              Unable to Load
            </h2>

            <p className="mt-2 text-sm text-[#666666]">
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
      <div className="mx-auto max-w-3xl px-4 py-6 pb-10">

        {/* --------------------------------
            Header
        --------------------------------- */}

        <div className="mb-5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-[5px] rounded-full bg-[#FFD600]" />

            <h1 className="text-[25px] font-black text-[#111111]">
              Join Tournament
            </h1>
          </div>

          <p className="mt-2 pl-[13px] text-sm text-[#777777]">
            Confirm your details and reserve
            your tournament booking.
          </p>
        </div>

        {/* --------------------------------
            Tournament Image
        --------------------------------- */}

        <div className="relative overflow-hidden rounded-[22px] border border-[#dddddd] bg-white shadow-[0_5px_18px_rgba(0,0,0,0.08)]">
          <img
            src={getTournamentImage(
              tournament.coins
            )}
            alt={`${tournament.coins} Coins Tournament`}
            className="block h-auto w-full"
          />

          <div className="absolute left-3 top-3 rounded-full bg-[#111111] px-3 py-[7px] text-[10px] font-black uppercase tracking-[0.08em] text-[#FFD600]">
            eFootball Tournament
          </div>
        </div>

        {/* --------------------------------
            Tournament Info
        --------------------------------- */}

        <div className="mt-4 overflow-hidden rounded-[22px] border border-[#dedede] bg-white shadow-[0_4px_15px_rgba(0,0,0,0.05)]">
          <div className="h-[5px] bg-[#FFD600]" />

          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#999999]">
                  Tournament
                </p>

                <h2 className="mt-1 text-[22px] font-black text-[#111111]">
                  {tournament.coins} Coins
                </h2>
              </div>

              <div className="rounded-full bg-[#111111] px-4 py-2 text-xs font-black text-[#FFD600]">
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

            <div className="mt-4 flex items-center justify-between rounded-[14px] bg-[#111111] p-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFD600]">
                  Winner Prize
                </p>

                <p className="mt-1 text-[17px] font-black text-white">
                  {tournament.coins} eFootball Coins
                </p>
              </div>

              <div className="text-[30px]">
                🏆
              </div>
            </div>
          </div>
        </div>

        {/* --------------------------------
            Profile
        --------------------------------- */}

        <div className="mt-4 overflow-hidden rounded-[22px] border border-[#dedede] bg-white shadow-[0_4px_15px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between border-b border-[#eeeeee] px-5 py-4">
            <h3 className="text-sm font-black text-[#111111]">
              Your Profile
            </h3>

            <div className="rounded-full bg-[#FFF7CC] px-3 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#111111]">
              Player
            </div>
          </div>

          <div className="flex items-center gap-4 p-5">
            {userProfile.profilePhoto ? (
              <div className="rounded-full border-[3px] border-[#FFD600] p-[2px]">
                <img
                  src={
                    userProfile.profilePhoto
                  }
                  alt={
                    userProfile.username
                  }
                  className="h-12 w-12 rounded-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#FFD600] bg-[#111111] text-xl font-black text-[#FFD600]">
                {userProfile.username
                  ?.charAt(0)
                  ?.toUpperCase() ||
                  "U"}
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate text-[16px] font-black text-[#111111]">
                {userProfile.username}
              </p>

              <p className="mt-1 text-sm font-medium text-[#777777]">
                Konami ID:{" "}
                <span className="text-[#111111]">
                  {userProfile.konamiId}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* --------------------------------
            Rules
        --------------------------------- */}

        <div className="mt-4 overflow-hidden rounded-[22px] border border-[#dedede] bg-white shadow-[0_4px_15px_rgba(0,0,0,0.05)]">
          <div className="border-b border-[#eeeeee] px-5 py-4">
            <h3 className="text-sm font-black text-[#111111]">
              Before You Join
            </h3>

            <p className="mt-1 text-[11px] text-[#999999]">
              Please check these details before confirming.
            </p>
          </div>

          <div className="space-y-4 p-5">
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
          <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">
              {error}
            </p>
          </div>
        )}

        {/* --------------------------------
            Already Joined
        --------------------------------- */}

        {alreadyJoined && (
          <div className="mt-4 rounded-[16px] border border-[#FFD600] bg-[#FFF7CC] p-4">
            <p className="text-sm font-bold text-[#111111]">
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
          className="mt-5 w-full rounded-[16px] bg-[#FFD600] px-5 py-[17px] text-sm font-black text-[#111111] shadow-[0_6px_16px_rgba(0,0,0,0.12)] transition active:scale-[0.98] hover:bg-[#111111] hover:text-[#FFD600] disabled:cursor-not-allowed disabled:opacity-40"
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

        <p className="mt-3 text-center text-xs font-medium text-[#777777]">
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
    <main className="min-h-screen bg-[#f2f2f2] text-[#111111]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#FFD600] shadow-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4">
          <h1 className="text-[18px] font-black tracking-[-0.02em] text-[#111111]">
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
    <div className="rounded-[14px] border border-[#e3e3e3] bg-[#f7f7f7] p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-[#999999]">
        {label}
      </p>

      <p className="mt-1 text-sm font-black text-[#111111]">
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
      <div className="mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFD600]">
        <div className="h-[6px] w-[6px] rounded-full bg-[#111111]" />
      </div>

      <p className="pt-[2px] text-sm font-medium leading-6 text-[#555555]">
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
          <div className="flex min-h-[60vh] flex-col items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-[4px] border-[#dddddd] border-t-[#FFD600]" />

            <div className="mt-3 text-sm font-semibold text-[#666666]">
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