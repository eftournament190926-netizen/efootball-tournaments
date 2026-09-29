"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import { db } from "@/lib/firebase";

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
  profilePhoto?: string;
  tournamentStats?: TournamentStats;
};

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();

  const userId =
    typeof params.userId === "string"
      ? params.userId
      : "";

  const [userData, setUserData] =
    useState<UserData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [notFound, setNotFound] =
    useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    let cancelled = false;

    async function loadUser() {
      try {
        setLoading(true);

        const userRef = doc(
          db,
          "users",
          userId
        );

        const userSnap =
          await getDoc(userRef);

        if (!userSnap.exists()) {
          if (!cancelled) {
            setNotFound(true);
            setUserData(null);
          }

          return;
        }

        if (!cancelled) {
          setUserData(
            userSnap.data() as UserData
          );

          setNotFound(false);
        }
      } catch (error) {
        console.error(
          "Failed to load public profile:",
          error
        );

        if (!cancelled) {
          setNotFound(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f1f1f1]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#4bd17b] border-t-transparent" />
        </div>
      </main>
    );
  }

  if (notFound || !userData) {
    return (
      <main className="min-h-screen bg-[#f1f1f1]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-white px-6">
          <div className="text-center">
            <h1 className="text-[22px] font-black text-[#111111]">
              Player not found
            </h1>

            <button
              type="button"
              onClick={() => router.back()}
              className="mt-5 rounded-[10px] bg-[#111111] px-6 py-3 text-[12px] font-black text-white"
            >
              GO BACK
            </button>
          </div>
        </div>
      </main>
    );
  }

  const tournament =
    userData.tournamentStats || {};

  const matches =
    Number(tournament.matches || 0);

  const wins =
    Number(tournament.wins || 0);

  const losses =
    Number(tournament.losses || 0);

  const goals =
    Number(tournament.goals || 0);

  const conceded =
    Number(tournament.conceded || 0);

  const tournamentPlayed =
    Number(
      tournament.tournamentPlayed || 0
    );

  const tournamentWon =
    Number(
      tournament.tournamentWon || 0
    );

  const tournamentRunner =
    Number(
      tournament.tournamentRunner || 0
    );

  const goalDifference =
    goals - conceded;

  const rankingPoints =
    wins * 3 -
    losses * 2 +
    tournamentWon * 3 +
    tournamentRunner * 2;

  return (
    <main className="min-h-screen bg-[#f1f1f1]">
      <div className="mx-auto min-h-screen max-w-md bg-white pb-8 shadow-[0_0_40px_rgba(0,0,0,0.08)]">

        {/* HEADER */}
        <section className="bg-[#111111] px-5 pb-8 pt-5 text-white">

          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={() => router.back()}
              className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[24px] font-black"
              aria-label="Go back"
            >
              ‹
            </button>

            <h1 className="text-[21px] font-black">
              Player Profile
            </h1>
          </div>

          {/* PROFILE */}
          <div className="mt-9 flex items-center gap-4">

            <div className="h-[82px] w-[82px] shrink-0 overflow-hidden rounded-full border-[3px] border-white bg-[#eeeeee]">
              {userData.profilePhoto ? (
                <img
                  src={userData.profilePhoto}
                  alt={userData.username || "Player"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[30px]">
                  👤
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-[22px] font-black leading-tight">
                {userData.username ||
                  "eFootball Player"}
              </h2>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-[#303030] text-[11px]">
                  🎮
                </div>

                <span className="max-w-[190px] truncate text-[12px] font-bold text-[#aaaaaa]">
                  {userData.konamiId ||
                    "Konami ID"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-9">
            <h3 className="text-[15px] font-bold text-[#a9a9a9]">
              Stats
            </h3>

            <div className="mt-3 h-[4px] w-[72px] rounded-full bg-white" />
          </div>
        </section>

        {/* STATS */}
        <section className="bg-[#eeeeee] px-2 py-5">
          <div className="rounded-[18px] border border-[#d1d1d1] bg-white px-4 py-7">

            {/* MATCH STATS */}
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

            {/* TOURNAMENT STATS */}
            <div className="mt-8 grid grid-cols-3 text-center">
              <StatItem
                value={tournamentPlayed}
                label="Tournament"
              />

              <StatItem
                value={tournamentWon}
                label="Winner"
              />

              <StatItem
                value={tournamentRunner}
                label="Runner"
              />
            </div>

            <div className="my-8 h-[1px] bg-[#e7e7e7]" />

            {/* GOAL STATS */}
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

            <div className="my-8 h-[1px] bg-[#e7e7e7]" />

            {/* RANKING POINTS */}
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#999999]">
                Ranking Points
              </div>

              <div className="mt-2 text-[32px] font-black text-[#111111]">
                {rankingPoints}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

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