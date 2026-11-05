"use client";

import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  getDocs,
  collection,
} from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import { db } from "@/lib/firebase";

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
  profilePhoto?: string;
  tournamentStats?: TournamentStats;
};

type RankingPlayer = {
  id: string;
  points: number;
  goalDifference: number;
  goals: number;
  wins: number;
};

type PlayerRanking = {
  rank: number;
  points: number;
  totalPlayers: number;
};

/* =================================================
   PUBLIC PROFILE PAGE
================================================= */

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

  /* RANKING STATES */

  const [playerRanking, setPlayerRanking] =
    useState<PlayerRanking | null>(null);

  const [rankingLoading, setRankingLoading] =
    useState(true);

  /* =================================================
     LOAD USER + RANKING
  ================================================= */

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setNotFound(true);
      setRankingLoading(false);
      return;
    }

    let cancelled = false;

    async function loadUser() {
      try {
        setLoading(true);
        setRankingLoading(true);

        /* LOAD PROFILE */

        const userRef = doc(
          db,
          "users",
          userId
        );

        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          if (!cancelled) {
            setNotFound(true);
            setUserData(null);
            setPlayerRanking(null);
          }

          return;
        }

        if (cancelled) return;

        const profileData =
          userSnap.data() as UserData;

        setUserData(profileData);
        setNotFound(false);

        /* =========================================
           LOAD ALL USERS FOR RANKING
        ========================================= */

        const usersSnapshot = await getDocs(
          collection(db, "users")
        );

        if (cancelled) return;

        const rankedPlayers: RankingPlayer[] = [];

        usersSnapshot.forEach((userDocument) => {
          const data = userDocument.data();

          const stats: TournamentStats =
            data.tournamentStats || {};

          const matches = Number(
            stats.matches || 0
          );

          const tournamentPlayed = Number(
            stats.tournamentPlayed || 0
          );

          // Exclude players without tournament activity.
          if (
            matches === 0 &&
            tournamentPlayed === 0
          ) {
            return;
          }

          const wins = Number(stats.wins || 0);
          const losses = Number(stats.losses || 0);
          const goals = Number(stats.goals || 0);
          const conceded = Number(stats.conceded || 0);

          const tournamentWon = Number(
            stats.tournamentWon || 0
          );

          const tournamentRunner = Number(
            stats.tournamentRunner || 0
          );

          /* SAME LEADERBOARD FORMULA */

          const points =
            wins * 3 -
            losses * 2 +
            tournamentWon * 3 +
            tournamentRunner * 2;

          rankedPlayers.push({
            id: userDocument.id,
            points,
            goalDifference: goals - conceded,
            goals,
            wins,
          });
        });

        /* =========================================
           SORT RANKING
        ========================================= */

        rankedPlayers.sort((a, b) => {
          if (a.points !== b.points) {
            return b.points - a.points;
          }

          if (
            a.goalDifference !== b.goalDifference
          ) {
            return (
              b.goalDifference - a.goalDifference
            );
          }

          if (a.goals !== b.goals) {
            return b.goals - a.goals;
          }

          if (a.wins !== b.wins) {
            return b.wins - a.wins;
          }

          return 0;
        });

        /* =========================================
           FIND THIS PROFILE'S RANK
        ========================================= */

        const playerIndex =
          rankedPlayers.findIndex(
            (player) => player.id === userId
          );

        if (!cancelled) {
          if (playerIndex !== -1) {
            setPlayerRanking({
              rank: playerIndex + 1,
              points:
                rankedPlayers[playerIndex].points,
              totalPlayers: rankedPlayers.length,
            });
          } else {
            setPlayerRanking(null);
          }
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
          setRankingLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  /* =================================================
     LOADING
  ================================================= */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-[#f2f2f2]">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-[#FFD600] border-t-[#111111]" />

            <p className="mt-3 text-[11px] font-bold text-[#777777]">
              Loading player...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* =================================================
     NOT FOUND
  ================================================= */

  if (notFound || !userData) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-[#f2f2f2] px-6">
          <div className="w-full rounded-[22px] border border-[#dddddd] bg-white px-6 py-10 text-center shadow-[0_5px_18px_rgba(0,0,0,0.06)]">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD600] text-[30px]">
              👤
            </div>

            <h1 className="mt-5 text-[22px] font-black text-[#111111]">
              Player not found
            </h1>

            <p className="mt-2 text-[11px] font-semibold text-[#999999]">
              This player profile is not available.
            </p>

            <button
              type="button"
              onClick={() => router.back()}
              className="mt-6 h-[46px] w-full rounded-[12px] bg-[#111111] text-[11px] font-black tracking-[0.08em] text-[#FFD600] transition active:scale-[0.98]"
            >
              GO BACK
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* =================================================
     STATS
  ================================================= */

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
    Number(tournament.tournamentPlayed || 0);

  const tournamentWon =
    Number(tournament.tournamentWon || 0);

  const tournamentRunner =
    Number(tournament.tournamentRunner || 0);

  const goalDifference =
    goals - conceded;

  /* =================================================
     PAGE
  ================================================= */

  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-[#f2f2f2] pb-8 shadow-[0_0_40px_rgba(0,0,0,0.08)]">

        {/* HEADER */}

        <section className="relative overflow-hidden bg-[#FFD600] px-5 pb-8 pt-5 text-[#111111]">

          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-black/[0.05]" />

          <div className="pointer-events-none absolute -bottom-24 -left-20 h-52 w-52 rounded-full bg-black/[0.04]" />

          {/* TOP */}

          <div className="relative z-10 flex items-center justify-center">
            <button
              type="button"
              onClick={() => router.back()}
              className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-[24px] font-black text-[#FFD600] transition active:scale-95"
              aria-label="Go back"
            >
              ‹
            </button>

            <div className="text-center">
              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-black/45">
                eFootball
              </p>

              <h1 className="mt-1 text-[22px] font-black">
                Player Profile
              </h1>
            </div>
          </div>

          {/* PROFILE */}

          <div className="relative z-10 mt-9 flex items-center gap-4">

            {/* PHOTO */}

            <div className="relative">
              <div className="h-[86px] w-[86px] shrink-0 overflow-hidden rounded-full border-[4px] border-[#111111] bg-white shadow-[0_5px_15px_rgba(0,0,0,0.18)]">
                {userData.profilePhoto ? (
                  <img
                    src={userData.profilePhoto}
                    alt={userData.username || "Player"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white text-[31px]">
                    👤
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#FFD600] bg-[#111111] text-[11px]">
                🎮
              </div>
            </div>

            {/* NAME */}

            <div className="min-w-0">
              <h2 className="truncate text-[23px] font-black leading-tight text-[#111111]">
                {userData.username || "eFootball Player"}
              </h2>
            </div>
          </div>

          {/* STATS TITLE */}

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

        {/* CAREER STATISTICS */}

        <section className="bg-[#eeeeee] px-3 py-5">
          <div className="overflow-hidden rounded-[20px] border border-[#d8d8d8] bg-white shadow-[0_5px_16px_rgba(0,0,0,0.05)]">

            {/* CARD HEADER */}

            <div className="flex items-center justify-between bg-[#111111] px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#FFD600]">
                  Career Statistics
                </p>

                <p className="mt-1 text-[10px] font-bold text-white/55">
                  eFootball Tournaments
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFD600] text-[17px]">
                📊
              </div>
            </div>

            <div className="px-4 py-7">

              {/* MATCH STATS */}

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

              <div className="my-7 h-[1px] bg-[#eeeeee]" />

              {/* TOURNAMENT STATS */}

              <div className="grid grid-cols-3 text-center">
                <StatItem
                  value={tournamentPlayed}
                  label="Tournament"
                />

                <StatItem
                  value={tournamentWon}
                  label="Winner"
                  highlight
                />

                <StatItem
                  value={tournamentRunner}
                  label="Runner"
                />
              </div>

              <div className="my-7 h-[1px] bg-[#eeeeee]" />

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
                  highlight
                />
              </div>
            </div>
          </div>

          {/* PLAYER RANKING */}

          <div className="mt-4 overflow-hidden rounded-[18px] border border-[#dedede] bg-white shadow-[0_4px_14px_rgba(0,0,0,0.05)]">

            <div className="flex items-center justify-between bg-[#111111] px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#FFD600]">
                  Player Ranking
                </p>

                <p className="mt-1 text-[9px] font-bold text-white/50">
                  Overall Tournament Position
                </p>
              </div>

              <span className="text-[22px]">
                🏆
              </span>
            </div>

            <div className="flex items-center justify-between px-5 py-5">

              {/* RANK */}

              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-[#999999]">
                  Player Position
                </p>

                {rankingLoading ? (
                  <p className="mt-2 text-[13px] font-bold text-[#999999]">
                    Calculating...
                  </p>
                ) : playerRanking ? (
                  <p className="mt-1 text-[32px] font-black text-[#111111]">
                    #{playerRanking.rank}
                  </p>
                ) : (
                  <p className="mt-2 text-[12px] font-bold text-[#999999]">
                    Not Ranked Yet
                  </p>
                )}
              </div>

              {/* POINTS */}

              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#999999]">
                  Ranking Points
                </p>

                <p className="mt-1 text-[27px] font-black text-[#111111]">
                  {rankingLoading
                    ? "..."
                    : playerRanking?.points ?? 0}
                </p>

                <p className="text-[9px] font-bold text-[#999999]">
                  {playerRanking
                    ? `Out of ${playerRanking.totalPlayers} players`
                    : "Play tournaments to rank"}
                </p>
              </div>
            </div>
          </div>

          {/* SUMMARY */}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-[#FFD600] p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-black/50">
                Total Wins
              </p>

              <p className="mt-2 text-[24px] font-black leading-none text-[#111111]">
                {wins}
              </p>
            </div>

            <div className="rounded-[16px] bg-black p-4 shadow-[0_3px_12px_rgba(0,0,0,0.05)]">
              <p className="text-[8px] font-black uppercase tracking-[0.12em] text-[#FFD600]">
                Championships
              </p>

              <p className="mt-2 text-[24px] font-black leading-none text-[#FFD600]">
                {tournamentWon}
              </p>
            </div>
          </div>
        </section>
      </div>
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