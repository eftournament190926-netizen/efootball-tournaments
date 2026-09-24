"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";

/* =================================================
   TYPES
================================================= */

type TournamentStats = {
  matches?: number;
  wins?: number;
  losses?: number;
  goals?: number;
  conceded?: number;
  tournamentPlayed?: number;
  tournamentWon?: number;
  tournamentRunner?: number;
};

type UserData = {
  username?: string;
  konamiId?: string;
  email?: string;
  profilePhoto?: string;
  tournamentStats?: TournamentStats;
};

/* =================================================
   PROFILE PAGE
================================================= */

export default function ProfilePage() {
  const router = useRouter();

  const [userData, setUserData] =
    useState<UserData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [loggingOut, setLoggingOut] =
    useState(false);

  /* -----------------------------------------------
     LOAD USER
  ----------------------------------------------- */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.replace("/login");
          return;
        }

        try {
          const userRef = doc(
            db,
            "users",
            user.uid
          );

          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            setUserData(
              userSnap.data() as UserData
            );
          } else {
            setUserData({
              email: user.email || "",
            });
          }
        } catch (error) {
          console.error(
            "Failed to load profile:",
            error
          );
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  /* -----------------------------------------------
     LOGOUT
  ----------------------------------------------- */

  async function handleLogout() {
    if (loggingOut) return;

    try {
      setLoggingOut(true);

      await signOut(auth);

      router.replace("/login");
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );

      setLoggingOut(false);
    }
  }

  /* -----------------------------------------------
     LOADING
  ----------------------------------------------- */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f1f1f1]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-white">
          <p className="text-[11px] font-bold text-[#777777]">
            Loading profile...
          </p>
        </div>
      </main>
    );
  }

  /* -----------------------------------------------
     STATS
  ----------------------------------------------- */

  const tournament =
    userData?.tournamentStats || {};

  const matches =
    tournament.matches || 0;

  const wins =
    tournament.wins || 0;

  const losses =
    tournament.losses || 0;

  const goals =
    tournament.goals || 0;

  const conceded =
    tournament.conceded || 0;

  const goalDifference =
    goals - conceded;

  /* =================================================
     PAGE
  ================================================= */

  return (
    <main className="min-h-screen bg-[#f1f1f1]">

      {/* ===========================================
          SAME MOBILE FRAME AS HOME
      =========================================== */}

      <div className="mx-auto min-h-screen max-w-md bg-white pb-[82px] shadow-[0_0_40px_rgba(0,0,0,0.08)]">

        {/* =========================================
            HEADER
        ========================================= */}

        <section className="bg-[#111111] px-5 pb-8 pt-6 text-white">

          {/* TOP HEADER */}

          <div className="flex items-center justify-between gap-3">

            <h1 className="text-[23px] font-black tracking-tight">
              Profile
            </h1>

            <p className="max-w-[180px] truncate text-[11px] font-bold text-[#b5b5b5]">
              {userData?.email || "Email"}
            </p>

          </div>

          {/* =======================================
              PROFILE USER
          ======================================= */}

          <div className="mt-9 flex items-center gap-4">

            {/* PROFILE PHOTO */}

            <div className="h-[82px] w-[82px] shrink-0 overflow-hidden rounded-full border-[3px] border-white bg-[#eeeeee]">

              {userData?.profilePhoto ? (
                <img
                  src={userData.profilePhoto}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[30px]">
                  👤
                </div>
              )}

            </div>

            {/* USERNAME / KONAMI */}

            <div className="min-w-0">

              <h2 className="truncate text-[22px] font-black leading-tight">
                {userData?.username ||
                  "eFootball Player"}
              </h2>

              <div className="mt-3 flex items-center gap-2">

                <div className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-[#303030] text-[11px]">
                  🎮
                </div>

                <span className="max-w-[190px] truncate text-[12px] font-bold text-[#aaaaaa]">
                  {userData?.konamiId ||
                    "Konami ID"}
                </span>

              </div>

            </div>

          </div>

          {/* =======================================
              STATS TITLE
          ======================================= */}

          <div className="mt-9">

            <h3 className="text-[15px] font-bold text-[#a9a9a9]">
              Stats
            </h3>

            <div className="mt-3 h-[4px] w-[72px] rounded-full bg-white" />

          </div>

        </section>

        {/* =========================================
            STATS AREA
        ========================================= */}

        <section className="bg-[#eeeeee] px-2 py-5">

          <div className="rounded-[18px] border border-[#d1d1d1] bg-white px-4 py-7">

            {/* =====================================
                MATCH / WIN / LOSS
            ===================================== */}

            <div className="grid grid-cols-3 text-center">

              <StatItem
                value={matches}
                label="Match"
              />

              <StatItem
                value={wins}
                label="Win"
              />

              <StatItem
                value={losses}
                label="Loss"
              />

            </div>

            {/* =====================================
                TOURNAMENT / WINNER / RUNNER
            ===================================== */}

            <div className="mt-8 grid grid-cols-3 text-center">

              <StatItem
  value={
    tournament.tournamentPlayed ||
    0
  }
  label="Tournament"
/>

              <StatItem
  value={
    tournament.tournamentWon ||
    0
  }
  label="Winner"
/>

<StatItem
  value={
    tournament.tournamentRunner ||
    0
  }
  label="Runner"
/>

            </div>

            {/* =====================================
                DIVIDER
            ===================================== */}

            <div className="my-8 h-[1px] bg-[#e7e7e7]" />

            {/* =====================================
                GOALS / CONCEDED / DIFFERENCE
            ===================================== */}

            <div className="grid grid-cols-3 text-center">

              <StatItem
                value={goals}
                label="Goals"
              />

              <StatItem
                value={conceded}
                label="Conceded"
              />

              <StatItem
                value={
                  goalDifference >= 0
                    ? `+${goalDifference}`
                    : goalDifference
                }
                label="Goal Difference"
              />

            </div>

          </div>

        </section>

        {/* =========================================
            LOGOUT
        ========================================= */}

        <section className="bg-[#eeeeee] px-4 pb-6 pt-0">

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="h-[48px] w-full rounded-[10px] bg-[#111111] text-[11px] font-black text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            {loggingOut
              ? "LOGGING OUT..."
              : "LOGOUT"}
          </button>

        </section>

      </div>

      {/* ===========================================
          FIXED BOTTOM NAV
          SAME SIZE AS HOME
      =========================================== */}

      <BottomNavigation />

    </main>
  );
}

/* =================================================
   STAT ITEM
================================================= */

function StatItem({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="min-w-0">

      <div className="text-[22px] font-normal leading-none text-[#111111]">
        {value}
      </div>

      <div className="mt-2 whitespace-nowrap text-[9px] font-medium text-[#999999]">
        {label}
      </div>

    </div>
  );
}

/* =================================================
   BOTTOM NAVIGATION
   SAME STRUCTURE AS HOME
================================================= */

function BottomNavigation() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e5e7eb] bg-white">

      <div className="mx-auto grid h-[72px] max-w-md grid-cols-5">

        {/* =======================================
            TOURNAMENTS
        ======================================= */}

        <BottomNavItem
          icon="🏆"
          label="Tournaments"
          onClick={() =>
            router.push("/")
          }
        />

        {/* =======================================
            MY TOURNAMENTS
        ======================================= */}

        <BottomNavItem
          icon="🎮"
          label={
            <>
              My
              <br />
              Tournaments
            </>
          }
          onClick={() =>
            router.push("/my-tournaments")
          }
        />

        {/* =======================================
            DIVISION
        ======================================= */}

        <BottomNavItem
          icon="⚡"
          label={
            <>
              Division
              <br />
              League
            </>
          }
          onClick={() =>
            router.push("/division")
          }
        />

        {/* =======================================
            LEADERBOARD
        ======================================= */}

        <BottomNavItem
          icon="🏅"
          label={
            <>
              Leader
              <br />
              Board
            </>
          }
          onClick={() =>
            router.push("/leaderboard")
          }
        />

        {/* =======================================
            PROFILE
        ======================================= */}

        <BottomNavItem
          icon="👤"
          label="Profile"
          active
          onClick={() =>
            router.push("/profile")
          }
        />

      </div>

    </nav>
  );
}

/* =================================================
   BOTTOM NAV ITEM
================================================= */

function BottomNavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: string;
  label: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full flex-col items-center justify-center gap-[3px] ${
        active
          ? "text-[#111111]"
          : "text-[#a6a6a6]"
      }`}
    >

      <span className="flex h-[23px] items-center justify-center text-[19px] leading-none">
        {icon}
      </span>

      <span
        className={`text-[8px] leading-[10px] ${
          active
            ? "font-black text-[#111111]"
            : "font-bold text-[#a6a6a6]"
        }`}
      >
        {label}
      </span>

    </button>
  );
}