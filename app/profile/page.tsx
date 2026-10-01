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
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-[#f2f2f2]">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-[#FFD600] border-t-[#111111]" />

            <p className="mt-3 text-[11px] font-bold text-[#777777]">
              Loading profile...
            </p>
          </div>
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
    <main className="min-h-screen bg-[#eeeeee]">

      {/* ===========================================
          SAME MOBILE FRAME AS HOME
      =========================================== */}

      <div className="mx-auto min-h-screen max-w-md bg-[#f2f2f2] pb-[82px] shadow-[0_0_40px_rgba(0,0,0,0.08)]">

        {/* =========================================
            HEADER
        ========================================= */}

        <section className="relative overflow-hidden bg-[#FFD600] px-5 pb-8 pt-6 text-[#111111]">

          {/* DECORATION */}

          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-black/[0.05]" />

          <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-black/[0.04]" />

          {/* TOP HEADER */}

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-black/50">
                eFootball
              </p>

              <h1 className="mt-1 text-[25px] font-black tracking-tight">
                Profile
              </h1>
            </div>

            <div className="max-w-[180px] rounded-full bg-[#111111] px-3 py-[7px]">
              <p className="truncate text-[9px] font-black text-[#FFD600]">
                {userData?.email || "Email"}
              </p>
            </div>
          </div>

          {/* =======================================
              PROFILE USER
          ======================================= */}

          <div className="relative z-10 mt-8 flex items-center gap-4">

            {/* PROFILE PHOTO */}

            <div className="relative">
              <div className="h-[86px] w-[86px] shrink-0 overflow-hidden rounded-full border-[4px] border-[#111111] bg-white shadow-[0_5px_15px_rgba(0,0,0,0.18)]">
                {userData?.profilePhoto ? (
                  <img
                    src={userData.profilePhoto}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white text-[32px]">
                    👤
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#FFD600] bg-[#111111] text-[11px]">
                🎮
              </div>
            </div>

            {/* USERNAME / KONAMI */}

            <div className="min-w-0">
              <h2 className="truncate text-[23px] font-black leading-tight text-[#111111]">
                {userData?.username ||
                  "eFootball Player"}
              </h2>

              <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-[#111111] px-3 py-2">
                <span className="text-[11px]">
                  🎮
                </span>

                <span className="max-w-[165px] truncate text-[10px] font-black text-[#FFD600]">
                  {userData?.konamiId ||
                    "Konami ID"}
                </span>
              </div>
            </div>
          </div>

          {/* =======================================
              STATS TITLE
          ======================================= */}

          <div className="relative z-10 mt-9 flex items-end justify-between">
            <div>
              <h3 className="text-[16px] font-black text-[#111111]">
                Player Stats
              </h3>

              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-black/45">
                Tournament Performance
              </p>
            </div>

            <div className="h-[5px] w-[72px] rounded-full bg-[#111111]" />
          </div>
        </section>

        {/* =========================================
            STATS AREA
        ========================================= */}

        <section className="bg-[#eeeeee] px-3 py-5">

          <div className="overflow-hidden rounded-[20px] border border-[#d8d8d8] bg-white shadow-[0_5px_16px_rgba(0,0,0,0.05)]">

            {/* STATS CARD HEADER */}

            <div className="flex items-center justify-between bg-[#111111] px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#FFD600]">
                  Career Statistics
                </p>

                <p className="mt-1 text-[11px] font-bold text-white/60">
                  eFootball Tournaments
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFD600] text-[17px]">
                📊
              </div>
            </div>

            <div className="px-4 py-7">

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
                  highlight
                />

                <StatItem
                  value={losses}
                  label="Loss"
                />
              </div>

              {/* DIVIDER */}

              <div className="my-7 h-[1px] bg-[#eeeeee]" />

              {/* =====================================
                  TOURNAMENT / WINNER / RUNNER
              ===================================== */}

              <div className="grid grid-cols-3 text-center">
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
                  highlight
                />

                <StatItem
                  value={
                    tournament.tournamentRunner ||
                    0
                  }
                  label="Runner"
                />
              </div>

              {/* DIVIDER */}

              <div className="my-7 h-[1px] bg-[#eeeeee]" />

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
                  highlight
                />
              </div>
            </div>
          </div>

          {/* =========================================
              SMALL SUMMARY
          ========================================= */}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-[#FFD600] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-black/55">
                Total Wins
              </p>

              <p className="mt-2 text-[25px] font-black leading-none text-[#111111]">
                {wins}
              </p>
            </div>

            <div className="rounded-[16px] bg-[#111111] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#FFD600]/70">
                Championships
              </p>

              <p className="mt-2 text-[25px] font-black leading-none text-[#FFD600]">
                {tournament.tournamentWon || 0}
              </p>
            </div>
          </div>
        </section>

        {/* =========================================
            LOGOUT
        ========================================= */}

        <section className="bg-[#eeeeee] px-4 pb-7 pt-1">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#111111] text-[11px] font-black tracking-[0.08em] text-[#FFD600] shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition hover:bg-[#222222] active:scale-[0.98] disabled:opacity-60"
          >
            <span>
              ↪
            </span>

            {loggingOut
              ? "LOGGING OUT..."
              : "LOGOUT"}
          </button>
        </section>
      </div>

      {/* ===========================================
          FIXED BOTTOM NAV
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
  highlight = false,
}: {
  value: number | string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 px-1">
      {highlight ? (
        <div className="mx-auto flex min-h-[44px] min-w-[44px] max-w-fit items-center justify-center rounded-[12px] bg-[#FFD600] px-3 text-[21px] font-black leading-none text-[#111111]">
          {value}
        </div>
      ) : (
        <div className="flex min-h-[44px] items-center justify-center text-[22px] font-black leading-none text-[#111111]">
          {value}
        </div>
      )}

      <div className="mt-2 whitespace-nowrap text-[9px] font-bold text-[#999999]">
        {label}
      </div>
    </div>
  );
}

/* =================================================
   BOTTOM NAVIGATION
================================================= */

function BottomNavigation() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#222222] bg-[#111111]">
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
      className={`flex h-full flex-col items-center justify-center gap-[3px] transition ${
        active
          ? "text-[#FFD600]"
          : "text-[#8b8b8b]"
      }`}
    >
      <span className="flex h-[23px] items-center justify-center text-[19px] leading-none">
        {icon}
      </span>

      <span
        className={`text-[8px] leading-[10px] ${
          active
            ? "font-black text-[#FFD600]"
            : "font-bold text-[#8b8b8b]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}