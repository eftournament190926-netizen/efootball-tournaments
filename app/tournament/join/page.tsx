"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { Suspense } from "react";

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

function JoinTournamentContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromMyTournaments =
  searchParams.get("from") === "my-tournaments";

  const [authUser, setAuthUser] =
    useState<User | null>(null);

  const [userProfile, setUserProfile] =
    useState<UserProfile | null>(null);

  const [tournament, setTournament] =
    useState<Tournament | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [joining, setJoining] =
    useState(false);

  const [error, setError] =
    useState("");

  const [alreadyJoined, setAlreadyJoined] =
    useState(false);

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(auth, (user) => {
        setAuthUser(user);
      });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!tournamentId) {
      setError("Tournament not found.");
      setLoading(false);
      return;
    }

    if (!authUser) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        /*
         * Load tournament
         */
        const tournamentRef = doc(
          db,
          "tournaments",
          tournamentId
        );

        const tournamentSnapshot =
          await getDoc(tournamentRef);

        if (!tournamentSnapshot.exists()) {
          if (!cancelled) {
            setError(
              "This tournament does not exist."
            );
          }

          return;
        }

        const tournamentData =
          tournamentSnapshot.data();

        const loadedTournament: Tournament = {
          id: tournamentSnapshot.id,

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

          category:
            tournamentData.category || "",

          date:
            tournamentData.date || "",

          time:
            tournamentData.time || "",

          status:
            tournamentData.status ||
            "upcoming",

          roomCode:
            tournamentData.roomCode || "",

          roomCodeA:
            tournamentData.roomCodeA || "",

          roomCodeB:
            tournamentData.roomCodeB || "",

          finalRoomCode:
            tournamentData.finalRoomCode || "",
        };

        /*
         * Load user profile
         */
        const userRef = doc(
          db,
          "users",
          authUser.uid
        );

        const userSnapshot =
          await getDoc(userRef);

        if (!userSnapshot.exists()) {
          if (!cancelled) {
            setError(
              "Your profile was not found."
            );
          }

          return;
        }

        const userData =
          userSnapshot.data();

        const loadedProfile: UserProfile = {
          uid: authUser.uid,

          username:
            userData.username ||
            "Player",

          konamiId:
            userData.konamiId || "",

          email:
            userData.email ||
            authUser.email ||
            "",

          profilePhoto:
            userData.profilePhoto || "",
        };

        /*
         * Check whether this user already
         * joined this tournament.
         */
        const existingQuery = query(
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

        const existingSnapshot =
          await getDocs(existingQuery);

        if (!cancelled) {
          setTournament(
            loadedTournament
          );

          setUserProfile(
            loadedProfile
          );

          setAlreadyJoined(
            !existingSnapshot.empty
          );
        }
      } catch (err) {
        console.error(
          "Failed to load join page:",
          err
        );

        if (!cancelled) {
          setError(
            "Something went wrong. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [authUser, tournamentId]);

  async function handleJoin() {
    if (
      joining ||
      !authUser ||
      !userProfile ||
      !tournament
    ) {
      return;
    }

    setError("");

    /*
     * Check status again before joining.
     */
    if (
      tournament.status === "cancelled" ||
      tournament.status === "completed" ||
      tournament.status === "closed"
    ) {
      setError(
        "This tournament is no longer available."
      );

      return;
    }

    if (
      tournament.registeredPlayers >=
      tournament.maxPlayers
    ) {
      setError(
        "This tournament is full."
      );

      return;
    }

    if (alreadyJoined) {
      setError(
        "You have already joined this tournament."
      );

      return;
    }

    try {
      setJoining(true);

      /*
       * Re-check tournament and existing
       * registration immediately before writing.
       */
      const tournamentRef = doc(
        db,
        "tournaments",
        tournament.id
      );

      const freshTournamentSnapshot =
        await getDoc(tournamentRef);

      if (!freshTournamentSnapshot.exists()) {
        setError(
          "Tournament no longer exists."
        );

        return;
      }

      const freshTournament =
        freshTournamentSnapshot.data();

      const currentPlayers = Number(
        freshTournament.registeredPlayers ||
          0
      );

      const maxPlayers = Number(
        freshTournament.maxPlayers || 0
      );

      if (currentPlayers >= maxPlayers) {
        setError(
          "Tournament is already full."
        );

        return;
      }

      /*
       * Check duplicate registration again.
       */
      const duplicateQuery = query(
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

      const duplicateSnapshot =
        await getDocs(duplicateQuery);

      if (!duplicateSnapshot.empty) {
        setAlreadyJoined(true);

        setError(
          "You have already joined this tournament."
        );

        return;
      }

      /*
       * Create registration document.
       */
      const registrationRef = doc(
        collection(
          db,
          "tournamentRegistrations"
        )
      );

      const batch = writeBatch(db);

      batch.set(registrationRef, {
        tournamentId: tournament.id,

        userId: authUser.uid,

        username:
          userProfile.username,

        profilePhoto:
          userProfile.profilePhoto || "",

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

        status: "confirmed",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      });

      /*
       * Increase registered players.
       */
      batch.update(tournamentRef, {
        registeredPlayers:
          increment(1),

        updatedAt:
          serverTimestamp(),
      });

      await batch.commit();

      /*
       * Go to success page.
       */
      router.push(
        `/tournament/payment-success?tournament=${encodeURIComponent(
          tournament.id
        )}`
      );
    } catch (err) {
      console.error(
        "Tournament join failed:",
        err
      );

      setError(
        "Unable to join tournament. Please try again."
      );
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <PageFrame>
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#4bd17b] border-t-transparent" />
        </div>
      </PageFrame>
    );
  }

  if (!authUser) {
    return (
      <PageFrame>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full text-center">
            <div className="text-[24px] font-black text-[#111111]">
              Login Required
            </div>

            <p className="mt-2 text-[14px] font-medium text-[#777777]">
              Please login before joining a tournament.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/login?redirect=/tournament/join?tournament=${encodeURIComponent(
                    tournamentId
                  )}`
                )
              }
              className="mt-6 w-full rounded-[10px] bg-[#4bd17b] py-3 text-[17px] font-black text-[#111111]"
            >
              Login
            </button>
          </div>
        </div>
      </PageFrame>
    );
  }

  if (!tournament || !userProfile) {
    return (
      <PageFrame>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <div className="text-[21px] font-black text-[#111111]">
              {error || "Something went wrong."}
            </div>

            <button
              type="button"
              onClick={() => router.back()}
              className="mt-5 rounded-[10px] bg-[#4bd17b] px-6 py-3 text-[16px] font-black text-[#111111]"
            >
              Go Back
            </button>
          </div>
        </div>
      </PageFrame>
    );
  }

  const isFull =
    tournament.registeredPlayers >=
    tournament.maxPlayers;

  const isClosed =
    tournament.status === "cancelled" ||
    tournament.status === "completed" ||
    tournament.status === "closed";

  return (
    <PageFrame>
      {/* Header */}
      <div className="sticky top-0 z-20 flex h-[56px] items-center border-b border-[#e8e8e8] bg-white px-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center text-[28px] font-light leading-none text-[#111111]"
          aria-label="Go back"
        >
          ‹
        </button>

        <div className="flex-1 text-center">
          <div className="text-[18px] font-black text-[#111111]">
            Join Tournament
          </div>
        </div>

        <div className="w-9" />
      </div>

      <div className="px-4 pb-8 pt-4">
        {/* Tournament image */}
        <div className="overflow-hidden rounded-[16px] bg-[#f2f2f2]">
          <img
            src={getTournamentImage(
              tournament.coins
            )}
            alt={`${tournament.coins} coins tournament`}
            className="block w-full object-cover"
          />
        </div>

        {/* Tournament info */}
        <div className="mt-4 rounded-[16px] bg-[#f5f5f5] p-4">
          <div className="text-center">
            <div className="text-[25px] font-black leading-none text-[#111111]">
              {tournament.time}
            </div>

            <div className="mt-2 text-[13px] font-bold text-[#888888]">
              {tournament.date}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3">
            <InfoItem
              label="Entry Fee"
              value={`₹${tournament.entryFee}`}
            />

            <InfoItem
              label="Players"
              value={`${tournament.registeredPlayers}/${tournament.maxPlayers}`}
            />

            <InfoItem
              label="Prize"
              value={`${tournament.coins} 🪙`}
            />
          </div>
        </div>

        {/* User */}
        <div className="mt-4">
          <div className="mb-2 text-[15px] font-black text-[#111111]">
            Your Profile
          </div>

          <div className="flex items-center rounded-[16px] border border-[#e6e6e6] bg-white p-3">
            <div className="h-[48px] w-[48px] shrink-0 overflow-hidden rounded-full bg-[#eeeeee]">
              {userProfile.profilePhoto ? (
                <img
                  src={userProfile.profilePhoto}
                  alt={userProfile.username}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[22px]">
                  👤
                </div>
              )}
            </div>

            <div className="ml-3 min-w-0">
              <div className="truncate text-[17px] font-black text-[#111111]">
                {userProfile.username}
              </div>

              <div className="mt-1 truncate text-[12px] font-medium text-[#888888]">
                KONAMI ID: {userProfile.konamiId}
              </div>
            </div>

            <div className="ml-auto rounded-full bg-[#dff8e8] px-3 py-1 text-[11px] font-black text-[#20854b]">
              Verified
            </div>
          </div>
        </div>

        {/* Rules */}
        <div className="mt-5 rounded-[16px] bg-white">
          <div className="text-[17px] font-black text-[#111111]">
            Before You Join
          </div>

          <div className="mt-3 space-y-3">
            <JoinRule text="Make sure your eFootball username is correct." />
            <JoinRule text="Your tournament slot will be reserved after confirmation." />
            <JoinRule text="Room details will be provided according to the tournament schedule." />
            <JoinRule text="You must be available at the scheduled tournament time." />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-5 rounded-[12px] border border-[#f1bcbc] bg-[#fff1f1] px-4 py-3 text-[13px] font-bold leading-[1.4] text-[#b42318]">
            {error}
          </div>
        )}

        {/* Already joined */}
        {alreadyJoined && (
          <div className="mt-5 rounded-[12px] bg-[#e8f8ee] px-4 py-3 text-center text-[14px] font-black text-[#20854b]">
            You have already joined this tournament.
          </div>
        )}

        {/* Confirm button */}
        <button
          type="button"
          disabled={
            joining ||
            alreadyJoined ||
            isFull ||
            isClosed
          }
          onClick={handleJoin}
          className={`mt-6 w-full rounded-[11px] py-[14px] text-[18px] font-black text-[#111111] shadow-[0_2px_5px_rgba(0,0,0,0.08)] transition active:scale-[0.99] ${
            joining ||
            alreadyJoined ||
            isFull ||
            isClosed
              ? "bg-[#d2d5d3]"
              : "bg-[#4bd17b]"
          }`}
        >
          {joining
            ? "Joining..."
            : alreadyJoined
            ? "Already Joined"
            : isClosed
            ? "Tournament Closed"
            : isFull
            ? "Tournament Full"
            : `Confirm & Join • ₹${tournament.entryFee}`}
        </button>

        <p className="mt-3 text-center text-[11px] font-medium leading-[1.4] text-[#999999]">
          Your registered profile details will be used
          for this tournament.
        </p>
      </div>
    </PageFrame>
  );
}

function PageFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-white shadow-[0_0_40px_rgba(0,0,0,0.08)]">
        {children}
      </div>
    </main>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-center">
      <div className="text-[11px] font-bold text-[#999999]">
        {label}
      </div>

      <div className="mt-1 text-[16px] font-black text-[#111111]">
        {value}
      </div>
    </div>
  );
}

function JoinRule({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full bg-[#4bd17b]" />

      <p className="text-[13px] font-medium leading-[1.45] text-[#666666]">
        {text}
      </p>
    </div>
  );
}

export default function JoinTournamentPage() {
  return (
    <Suspense
      fallback={
        <PageFrame>
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#4bd17b] border-t-transparent" />
          </div>
        </PageFrame>
      }
    >
      <JoinTournamentContent />
    </Suspense>
  );
}