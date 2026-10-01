"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

import { db } from "@/lib/firebase";

/* =================================================
   TYPES
================================================= */

type TournamentStats = {
  goals: number;
  conceded: number;
  matches: number;
  wins: number;
  losses: number;
  tournamentPlayed: number;
  tournamentWon: number;
  tournamentRunner: number;
};

type LeaderboardPlayer = {
  id: string;
  username: string;
  profilePhoto: string;

  matches: number;
  wins: number;
  losses: number;

  goals: number;
  conceded: number;
  goalDifference: number;

  tournamentPlayed: number;
  tournamentWon: number;
  tournamentRunner: number;

  rankingPoints: number;
};

/* =================================================
   HELPERS
================================================= */

function getNumber(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function calculateRankingPoints(
  stats: TournamentStats
) {
  return (
    Number(stats.wins || 0) * 3 -
    Number(stats.losses || 0) * 2 +
    Number(stats.tournamentWon || 0) * 3 +
    Number(stats.tournamentRunner || 0) * 2
  );
}

/* =================================================
   LEADERBOARD PAGE
================================================= */

export default function LeaderboardPage() {
  const router = useRouter();

  const [players, setPlayers] = useState<
    LeaderboardPlayer[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  /* -----------------------------------------------
     LOAD LEADERBOARD
  ----------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setLoading(true);
        setError("");

        const usersSnapshot =
          await getDocs(
            collection(db, "users")
          );

        const loadedPlayers:
          LeaderboardPlayer[] = [];

        usersSnapshot.forEach(
          (userDocument) => {
            const data =
              userDocument.data();

            const rawStats =
              data.tournamentStats;

            if (!rawStats) {
              return;
            }

            const stats: TournamentStats = {
              goals: getNumber(
                rawStats.goals
              ),

              conceded: getNumber(
                rawStats.conceded
              ),

              matches: getNumber(
                rawStats.matches
              ),

              wins: getNumber(
                rawStats.wins
              ),

              losses: getNumber(
                rawStats.losses
              ),

              tournamentPlayed:
                getNumber(
                  rawStats.tournamentPlayed
                ),

              tournamentWon:
                getNumber(
                  rawStats.tournamentWon
                ),

              tournamentRunner:
                getNumber(
                  rawStats.tournamentRunner
                ),
            };

            /*
             * Don't show players who
             * haven't played yet.
             */

            if (
              stats.matches === 0 &&
              stats.tournamentPlayed === 0
            ) {
              return;
            }

            const goalDifference =
              stats.goals -
              stats.conceded;

            const rankingPoints =
              calculateRankingPoints(
                stats
              );

            loadedPlayers.push({
              id: userDocument.id,

              username:
                data.username ||
                data.eFootballUsername ||
                "Player",

              profilePhoto:
                data.profilePhoto || "",

              matches:
                stats.matches,

              wins:
                stats.wins,

              losses:
                stats.losses,

              goals:
                stats.goals,

              conceded:
                stats.conceded,

              goalDifference,

              tournamentPlayed:
                stats.tournamentPlayed,

              tournamentWon:
                stats.tournamentWon,

              tournamentRunner:
                stats.tournamentRunner,

              rankingPoints,
            });
          }
        );

        /* =========================================
           RANKING

           1. Highest Points
           2. Highest Goal Difference
           3. Most Goals
           4. Most Wins
        ========================================= */

        loadedPlayers.sort(
          (a, b) => {
            if (
              a.rankingPoints !==
              b.rankingPoints
            ) {
              return (
                b.rankingPoints -
                a.rankingPoints
              );
            }

            if (
              a.goalDifference !==
              b.goalDifference
            ) {
              return (
                b.goalDifference -
                a.goalDifference
              );
            }

            if (
              a.goals !== b.goals
            ) {
              return (
                b.goals -
                a.goals
              );
            }

            if (
              a.wins !== b.wins
            ) {
              return (
                b.wins -
                a.wins
              );
            }

            return 0;
          }
        );

        if (!cancelled) {
          setPlayers(
            loadedPlayers
          );
        }
      } catch (error) {
        console.error(
          "Failed to load leaderboard:",
          error
        );

        if (!cancelled) {
          setError(
            "Failed to load ranking."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const rankedPlayers =
    useMemo(
      () => players,
      [players]
    );

  /* =================================================
     PAGE
  ================================================= */

  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-[#f2f2f2] pb-[82px] shadow-[0_0_40px_rgba(0,0,0,0.08)]">

        {/* =========================================
            HEADER
        ========================================= */}

        <header className="relative bg-[#FFD600] px-4 pb-6 pt-5 text-[#111111]">
          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="absolute left-4 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-[24px] font-black text-[#FFD600] transition active:scale-95"
            aria-label="Go back"
          >
            ‹
          </button>

          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-[19px]">
              🏆
            </div>

            <h1 className="mt-2 text-[27px] font-black">
              Ranking
            </h1>

            <p className="mt-1 text-[11px] font-bold text-black/55">
              Tournament Leaderboard
            </p>
          </div>
        </header>

        {/* =========================================
            RANKING RULES
        ========================================= */}

        <section className="px-3 pt-4">
          <div className="overflow-hidden rounded-[14px] border border-[#dedede] bg-white shadow-[0_3px_12px_rgba(0,0,0,0.04)]">
            <div className="bg-[#111111] px-3 py-2 text-center text-[9px] font-black uppercase tracking-[0.12em] text-[#FFD600]">
              Ranking Points
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-3 py-3 text-[10px] font-black text-[#666666]">
              <span>
                WIN{" "}
                <strong className="text-[#111111]">
                  +3
                </strong>
              </span>

              <span className="text-[#d0d0d0]">
                •
              </span>

              <span>
                LOSS{" "}
                <strong className="text-[#111111]">
                  -2
                </strong>
              </span>

              <span className="text-[#d0d0d0]">
                •
              </span>

              <span>
                CHAMPION{" "}
                <strong className="text-[#111111]">
                  +3
                </strong>
              </span>

              <span className="text-[#d0d0d0]">
                •
              </span>

              <span>
                RUNNER{" "}
                <strong className="text-[#111111]">
                  +2
                </strong>
              </span>
            </div>
          </div>
        </section>

        {/* =========================================
            LEADERBOARD TABLE
        ========================================= */}

        <section className="px-3 pt-4">
          <div className="overflow-hidden rounded-[16px] border border-[#dedede] bg-white shadow-[0_4px_14px_rgba(0,0,0,0.05)]">

            {/* TABLE TITLE */}

            <div className="flex items-center justify-between border-b border-[#eeeeee] px-4 py-3">
              <div>
                <p className="text-[14px] font-black text-[#111111]">
                  Top Players
                </p>

                <p className="mt-[2px] text-[9px] font-bold text-[#999999]">
                  Overall Tournament Ranking
                </p>
              </div>

              <div className="rounded-full bg-[#FFD600] px-3 py-[6px] text-[9px] font-black text-[#111111]">
                {rankedPlayers.length} Players
              </div>
            </div>

            {/* TABLE HEADER */}

            <div className="grid grid-cols-[28px_minmax(120px,1fr)_32px_28px_28px_52px_35px_42px] items-center bg-[#111111] px-2 py-3 text-[9px] font-black text-[#FFD600]">
              <div>
                #
              </div>

              <div>
                Top Player
              </div>

              <div className="text-center">
                MP
              </div>

              <div className="text-center">
                W
              </div>

              <div className="text-center">
                L
              </div>

              <div className="text-center">
                +/-
              </div>

              <div className="text-center">
                GD
              </div>

              <div className="text-center">
                Pts
              </div>
            </div>

            {/* =====================================
                LOADING
            ===================================== */}

            {loading ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center">
                <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#FFD600] border-t-[#111111]" />

                <p className="mt-3 text-[10px] font-bold text-[#888888]">
                  Loading ranking...
                </p>
              </div>
            ) : error ? (

              /* ===================================
                 ERROR
              =================================== */

              <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
                <div>
                  <div className="text-[30px]">
                    ⚠️
                  </div>

                  <p className="mt-3 text-[13px] font-bold text-red-500">
                    {error}
                  </p>
                </div>
              </div>

            ) : rankedPlayers.length === 0 ? (

              /* ===================================
                 EMPTY
              =================================== */

              <div className="flex min-h-[300px] items-center justify-center px-6 text-center">
                <div>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD600] text-[30px]">
                    🏆
                  </div>

                  <p className="mt-4 text-[15px] font-black text-[#111111]">
                    No ranking yet
                  </p>

                  <p className="mx-auto mt-2 max-w-[230px] text-[11px] font-semibold leading-5 text-[#999999]">
                    Players will appear after playing tournaments.
                  </p>
                </div>
              </div>

            ) : (

              /* ===================================
                 PLAYERS
              =================================== */

              rankedPlayers.map(
                (player, index) => (
                  <LeaderboardRow
                    key={player.id}
                    player={player}
                    rank={index + 1}
                  />
                )
              )
            )}
          </div>

          {/* LEGEND */}

          <div className="mt-3 px-1">
            <p className="text-[9px] font-semibold leading-4 text-[#999999]">
              MP = Matches Played • W = Wins • L = Losses • +/- = Goals Scored/Conceded • GD = Goal Difference
            </p>
          </div>
        </section>
      </div>

      {/* =========================================
          BOTTOM NAVIGATION
      ========================================= */}

      <BottomNavigation />
    </main>
  );
}

/* =================================================
   LEADERBOARD ROW
================================================= */

function LeaderboardRow({
  player,
  rank,
}: {
  player: LeaderboardPlayer;
  rank: number;
}) {
  const router = useRouter();

  const goalDifference =
    player.goalDifference > 0
      ? `+${player.goalDifference}`
      : String(
          player.goalDifference
        );

  return (
    <div
      className={`grid grid-cols-[28px_minmax(120px,1fr)_32px_28px_28px_52px_35px_42px] items-center border-t border-[#eeeeee] px-2 py-3 text-[11px] ${
        rank <= 3
          ? "bg-[#fffdf2]"
          : "bg-white"
      }`}
    >

      {/* =========================================
          RANK
      ========================================= */}

      <div className="font-black text-[#111111]">
        {rank === 1
          ? "🥇"
          : rank === 2
          ? "🥈"
          : rank === 3
          ? "🥉"
          : rank}
      </div>

      {/* =========================================
          PLAYER
          CLICK -> PUBLIC PROFILE
      ========================================= */}

      <button
        type="button"
        onClick={() =>
          router.push(
            `/profile/${player.id}`
          )
        }
        className="flex min-w-0 items-center gap-2 text-left"
      >

        {/* PROFILE PHOTO */}

        <div
          className={`h-8 w-8 shrink-0 overflow-hidden rounded-full ${
            rank <= 3
              ? "border-2 border-[#FFD600] bg-[#FFF7CC]"
              : "border border-[#e5e5e5] bg-[#eeeeee]"
          }`}
        >
          {player.profilePhoto ? (
            <img
              src={
                player.profilePhoto
              }
              alt={
                player.username
              }
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[12px] font-black text-[#111111]">
              {player.username
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
        </div>

        {/* USERNAME */}

        <div className="min-w-0">
          <div className="truncate text-[12px] font-black text-[#111111]">
            {player.username}
          </div>

          {(player.tournamentWon > 0 ||
            player.tournamentRunner > 0) && (
            <div className="mt-[2px] flex gap-1 text-[8px] font-bold text-[#777777]">
              {player.tournamentWon >
                0 && (
                <span>
                  🏆
                  {
                    player.tournamentWon
                  }
                </span>
              )}

              {player.tournamentRunner >
                0 && (
                <span>
                  🥈
                  {
                    player.tournamentRunner
                  }
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* =========================================
          MATCHES
      ========================================= */}

      <div className="text-center font-bold text-[#555555]">
        {player.matches}
      </div>

      {/* =========================================
          WINS
      ========================================= */}

      <div className="text-center font-black text-[#111111]">
        {player.wins}
      </div>

      {/* =========================================
          LOSSES
      ========================================= */}

      <div className="text-center font-bold text-[#777777]">
        {player.losses}
      </div>

      {/* =========================================
          GOALS / CONCEDED
      ========================================= */}

      <div className="text-center font-bold text-[#555555]">
        {player.goals}-
        {player.conceded}
      </div>

      {/* =========================================
          GOAL DIFFERENCE
      ========================================= */}

      <div className="text-center font-bold text-[#555555]">
        {goalDifference}
      </div>

      {/* =========================================
          POINTS
      ========================================= */}

      <div className="flex justify-center">
        <div className="flex min-w-[34px] items-center justify-center rounded-[8px] bg-[#FFD600] px-2 py-[5px] text-center text-[11px] font-black text-[#111111]">
          {player.rankingPoints}
        </div>
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

        {/* TOURNAMENTS */}

        <BottomNavItem
          icon="🏆"
          label="Tournaments"
          onClick={() =>
            router.push("/")
          }
        />

        {/* MY TOURNAMENTS */}

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
            router.push(
              "/my-tournaments"
            )
          }
        />

        {/* DIVISION LEAGUE */}

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
            router.push(
              "/division"
            )
          }
        />

        {/* LEADERBOARD */}

        <BottomNavItem
          icon="🏅"
          label={
            <>
              Leader
              <br />
              Board
            </>
          }
          active
          onClick={() =>
            router.push(
              "/leaderboard"
            )
          }
        />

        {/* PROFILE */}

        <BottomNavItem
          icon="👤"
          label="Profile"
          onClick={() =>
            router.push(
              "/profile"
            )
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