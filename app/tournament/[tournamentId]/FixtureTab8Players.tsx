"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/* =========================================================
   TYPES
========================================================= */

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
};

type Registration = {
  id: string;
  userId?: string;
  uid?: string;
  username?: string;
  profilePhoto?: string;
  status?: string;

  createdAt?: {
    seconds: number;
    nanoseconds: number;
  };
};

type Player = {
  id: string;
  username: string;
  profilePhoto: string;
};

type SavedScore = {
  p1Score: number;
  p2Score: number;
};

type SavedMatchPlayers = {
  player1Id: string | null;
  player2Id: string | null;
};

type Match = {
  id: number;
  player1: Player | null;
  player2: Player | null;
  score1: number | null;
  score2: number | null;
};

type Round =
  | "quarter"
  | "semi"
  | "final";

type Props = {
  tournament: Tournament;
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function FixtureTab8Players({
  tournament,
}: Props) {
  const [players, setPlayers] =
    useState<Player[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    activeRound,
    setActiveRound,
  ] =
    useState<Round>("quarter");

  const [scores, setScores] =
    useState<
      Record<string, SavedScore>
    >({});

  const [
    matchPlayers,
    setMatchPlayers,
  ] =
    useState<
      Record<
        string,
        SavedMatchPlayers
      >
    >({});

  const [
    penaltyWinners,
    setPenaltyWinners,
  ] =
    useState<
      Record<string, string>
    >({});

  /* =========================================================
     REALTIME TOURNAMENT LISTENER
  ========================================================= */

  useEffect(() => {
    const tournamentRef = doc(
      db,
      "tournaments",
      tournament.id
    );

    const unsubscribe =
      onSnapshot(
        tournamentRef,

        (snapshot) => {
          if (!snapshot.exists()) {
            return;
          }

          const data =
            snapshot.data();

          setScores(
            (data.scores ||
              {}) as Record<
              string,
              SavedScore
            >
          );

          setMatchPlayers(
            (data.matchPlayers ||
              {}) as Record<
              string,
              SavedMatchPlayers
            >
          );

          setPenaltyWinners(
            (data.penaltyWinners ||
              {}) as Record<
              string,
              string
            >
          );
        },

        (error) => {
          console.error(
            "Failed to listen to 8-player fixture:",
            error
          );
        }
      );

    return () =>
      unsubscribe();
  }, [tournament.id]);

  /* =========================================================
     LOAD REGISTERED PLAYERS
  ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      try {
        setLoading(true);

        const registrationsQuery =
          query(
            collection(
              db,
              "tournamentRegistrations"
            ),

            where(
              "tournamentId",
              "==",
              tournament.id
            )
          );

        const snapshot =
          await getDocs(
            registrationsQuery
          );

        const registrations: Registration[] =
          snapshot.docs.map(
            (item) => ({
              id: item.id,

              ...(item.data() as Omit<
                Registration,
                "id"
              >),
            })
          );

        /* =========================================
           KEEP REGISTRATION ORDER
        ========================================= */

        registrations.sort(
          (a, b) => {
            const aTime =
              a.createdAt?.seconds ??
              0;

            const bTime =
              b.createdAt?.seconds ??
              0;

            return (
              aTime - bTime
            );
          }
        );

        const loadedPlayers: Player[] =
          [];

        for (
          const registration of registrations
        ) {
          /* =======================================
             CONFIRMED PLAYERS ONLY
          ======================================= */

          if (
            registration.status &&
            registration.status !==
              "confirmed"
          ) {
            continue;
          }

          const uid =
            registration.userId ||
            registration.uid;

          /* =======================================
             REGISTRATION HAS PLAYER DATA
          ======================================= */

          if (
            registration.username
          ) {
            loadedPlayers.push({
              id:
                uid ||
                registration.id,

              username:
                registration.username,

              profilePhoto:
                registration.profilePhoto ||
                "",
            });

            continue;
          }

          if (!uid) {
            continue;
          }

          /* =======================================
             FALLBACK USERS COLLECTION
          ======================================= */

          try {
            const userSnapshot =
              await getDocs(
                query(
                  collection(
                    db,
                    "users"
                  ),

                  where(
                    "uid",
                    "==",
                    uid
                  )
                )
              );

            if (
              !userSnapshot.empty
            ) {
              const userData =
                userSnapshot.docs[0].data();

              loadedPlayers.push({
                id: uid,

                username:
                  userData.username ||
                  "Player",

                profilePhoto:
                  userData.profilePhoto ||
                  "",
              });
            }
          } catch (error) {
            console.error(
              "Failed to load player:",
              uid,
              error
            );
          }
        }

        if (!cancelled) {
          setPlayers(
            loadedPlayers.slice(
              0,
              8
            )
          );
        }
      } catch (error) {
        console.error(
          "Failed to load 8-player fixture:",
          error
        );

        if (!cancelled) {
          setPlayers([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [tournament.id]);

  /* =========================================================
     PLAYER MAP
  ========================================================= */

  const playerMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          Player
        >();

      for (
        const player of players
      ) {
        map.set(
          player.id,
          player
        );
      }

      return map;
    }, [players]);

  /* =========================================================
     PLAYER LOOKUP
  ========================================================= */

  function getSavedPlayer(
    playerId:
      | string
      | null
      | undefined
  ): Player | null {
    if (!playerId) {
      return null;
    }

    return (
      playerMap.get(
        playerId
      ) || null
    );
  }

  /* =========================================================
     SAVED SCORE

     Supports:
     scores.1

     and:
     scores.match1
  ========================================================= */

  function getSavedScore(
    matchId: number
  ): SavedScore | null {
    return (
      scores[
        String(matchId)
      ] ||
      scores[
        `match${matchId}`
      ] ||
      null
    );
  }

  /* =========================================================
     SAVED MATCH PLAYERS
  ========================================================= */

  function getSavedMatchPlayers(
    matchId: number
  ): SavedMatchPlayers | null {
    return (
      matchPlayers[
        String(matchId)
      ] ||
      matchPlayers[
        `match${matchId}`
      ] ||
      null
    );
  }

  /* =========================================================
     SAVED PENALTY WINNER
  ========================================================= */

  function getSavedPenaltyWinner(
    matchId: number
  ): string | null {
    return (
      penaltyWinners[
        String(matchId)
      ] ||
      penaltyWinners[
        `match${matchId}`
      ] ||
      null
    );
  }

  /* =========================================================
     GET MATCH WINNER
  ========================================================= */

  function getWinner(
    matchId: number,
    defaultPlayer1: Player | null,
    defaultPlayer2: Player | null
  ): Player | null {
    const savedPlayers =
      getSavedMatchPlayers(
        matchId
      );

    const player1 =
      getSavedPlayer(
        savedPlayers?.player1Id
      ) ||
      defaultPlayer1;

    const player2 =
      getSavedPlayer(
        savedPlayers?.player2Id
      ) ||
      defaultPlayer2;

    const score =
      getSavedScore(
        matchId
      );

    if (
      !player1 ||
      !player2
    ) {
      return null;
    }

    if (!score) {
      return null;
    }

    /* PLAYER 1 WIN */

    if (
      score.p1Score >
      score.p2Score
    ) {
      return player1;
    }

    /* PLAYER 2 WIN */

    if (
      score.p2Score >
      score.p1Score
    ) {
      return player2;
    }

    /* =========================================
       DRAW -> PENALTY WINNER
    ========================================= */

    const penaltyWinner =
      getSavedPenaltyWinner(
        matchId
      );

    if (!penaltyWinner) {
      return null;
    }

    if (
      penaltyWinner ===
      player1.id
    ) {
      return player1;
    }

    if (
      penaltyWinner ===
      player2.id
    ) {
      return player2;
    }

    return null;
  }

  /* =========================================================
     QUARTER FINAL

     Match 1 = Player 1 vs Player 2
     Match 2 = Player 3 vs Player 4
     Match 3 = Player 5 vs Player 6
     Match 4 = Player 7 vs Player 8
  ========================================================= */

  const quarterMatches =
    useMemo<Match[]>(
      () => {
        return Array.from(
          { length: 4 },

          (_, index) => {
            const matchId =
              index + 1;

            const defaultPlayer1 =
              players[
                index * 2
              ] || null;

            const defaultPlayer2 =
              players[
                index * 2 + 1
              ] || null;

            const savedPlayers =
              getSavedMatchPlayers(
                matchId
              );

            const savedScore =
              getSavedScore(
                matchId
              );

            const player1 =
              getSavedPlayer(
                savedPlayers
                  ?.player1Id
              ) ||
              defaultPlayer1;

            const player2 =
              getSavedPlayer(
                savedPlayers
                  ?.player2Id
              ) ||
              defaultPlayer2;

            return {
              id: matchId,

              player1,

              player2,

              score1:
                savedScore
                  ?.p1Score ??
                null,

              score2:
                savedScore
                  ?.p2Score ??
                null,
            };
          }
        );
      },
      [
        players,
        scores,
        matchPlayers,
        penaltyWinners,
        playerMap,
      ]
    );

  /* =========================================================
     SEMI FINAL

     Match 5 = Winner 1 vs Winner 2
     Match 6 = Winner 3 vs Winner 4
  ========================================================= */

  const semiMatches =
    useMemo<Match[]>(
      () => {
        const pairings = [
          [1, 2],
          [3, 4],
        ];

        return pairings.map(
          (
            [
              matchA,
              matchB,
            ],
            index
          ) => {
            const matchId =
              5 + index;

            const sourceA =
              quarterMatches.find(
                (match) =>
                  match.id ===
                  matchA
              );

            const sourceB =
              quarterMatches.find(
                (match) =>
                  match.id ===
                  matchB
              );

            /*
             * getWinner checks:
             * normal score
             * penalty winner
             */

            const player1 =
              getWinner(
                matchA,

                sourceA
                  ?.player1 ||
                  null,

                sourceA
                  ?.player2 ||
                  null
              );

            const player2 =
              getWinner(
                matchB,

                sourceB
                  ?.player1 ||
                  null,

                sourceB
                  ?.player2 ||
                  null
              );

            const savedPlayers =
              getSavedMatchPlayers(
                matchId
              );

            const savedScore =
              getSavedScore(
                matchId
              );

            const finalPlayer1 =
              getSavedPlayer(
                savedPlayers
                  ?.player1Id
              ) ||
              player1;

            const finalPlayer2 =
              getSavedPlayer(
                savedPlayers
                  ?.player2Id
              ) ||
              player2;

            return {
              id: matchId,

              player1:
                finalPlayer1,

              player2:
                finalPlayer2,

              score1:
                savedScore
                  ?.p1Score ??
                null,

              score2:
                savedScore
                  ?.p2Score ??
                null,
            };
          }
        );
      },
      [
        quarterMatches,
        scores,
        matchPlayers,
        penaltyWinners,
        playerMap,
      ]
    );

  /* =========================================================
     FINAL

     Match 7 = Winner 5 vs Winner 6
  ========================================================= */

  const finalMatch =
    useMemo<Match>(
      () => {
        const player1 =
          getWinner(
            5,

            semiMatches[0]
              ?.player1 ||
              null,

            semiMatches[0]
              ?.player2 ||
              null
          );

        const player2 =
          getWinner(
            6,

            semiMatches[1]
              ?.player1 ||
              null,

            semiMatches[1]
              ?.player2 ||
              null
          );

        const savedPlayers =
          getSavedMatchPlayers(
            7
          );

        const savedScore =
          getSavedScore(7);

        const finalPlayer1 =
          getSavedPlayer(
            savedPlayers
              ?.player1Id
          ) ||
          player1;

        const finalPlayer2 =
          getSavedPlayer(
            savedPlayers
              ?.player2Id
          ) ||
          player2;

        return {
          id: 7,

          player1:
            finalPlayer1,

          player2:
            finalPlayer2,

          score1:
            savedScore
              ?.p1Score ??
            null,

          score2:
            savedScore
              ?.p2Score ??
            null,
        };
      },
      [
        semiMatches,
        scores,
        matchPlayers,
        penaltyWinners,
        playerMap,
      ]
    );

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="min-h-[500px] bg-[#f2f2f2]">

        <div className="flex min-h-[300px] flex-col items-center justify-center">

          <div className="h-8 w-8 animate-spin rounded-full border-[4px] border-[#dddddd] border-t-[#FFD600]" />

          <div className="mt-3 text-[11px] font-black text-[#777777]">
            Loading fixture...
          </div>

        </div>
      </div>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="min-h-[700px] overflow-hidden bg-[#f2f2f2]">

      {/* =================================================
          ROUND HEADER
      ================================================= */}

      <div className="sticky top-0 z-40 border-b border-[#dddddd] bg-[#f2f2f2]/95 px-3 py-3 backdrop-blur-sm">

        <div className="flex gap-2 overflow-x-auto scrollbar-none">

          <RoundTab
            label="Quarter-final"
            active={
              activeRound ===
              "quarter"
            }
            onClick={() =>
              setActiveRound(
                "quarter"
              )
            }
          />

          <RoundTab
            label="Semi-final"
            active={
              activeRound ===
              "semi"
            }
            onClick={() =>
              setActiveRound(
                "semi"
              )
            }
          />

          <RoundTab
            label="Final"
            active={
              activeRound ===
              "final"
            }
            onClick={() =>
              setActiveRound(
                "final"
              )
            }
          />

        </div>
      </div>

      {/* =================================================
          QUARTER FINAL
      ================================================= */}

      {activeRound ===
        "quarter" && (
        <QuarterFinal
          matches={
            quarterMatches
          }
          semiMatches={
            semiMatches
          }
        />
      )}

      {/* =================================================
          SEMI FINAL
      ================================================= */}

      {activeRound ===
        "semi" && (
        <SemiFinal
          matches={
            semiMatches
          }
          finalMatch={
            finalMatch
          }
        />
      )}

      {/* =================================================
          FINAL
      ================================================= */}

      {activeRound ===
        "final" && (
        <FinalMatch
          match={
            finalMatch
          }
        />
      )}

    </div>
  );
}

/* =========================================================
   ROUND TAB
========================================================= */

function RoundTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-6 py-[11px] text-[13px] font-black transition active:scale-[0.97] ${
        active
          ? "border-[#FFD600] bg-[#FFD600] text-[#111111] shadow-[0_3px_8px_rgba(0,0,0,0.15)]"
          : "border-[#d7d7d7] bg-white text-[#777777]"
      }`}
    >
      {label}
    </button>
  );
}

/* =========================================================
   QUARTER FINAL
========================================================= */

function QuarterFinal({
  matches,
  semiMatches,
}: {
  matches: Match[];
  semiMatches: Match[];
}) {
  return (
    <div className="relative min-h-[850px] overflow-x-auto px-3 py-5">

      {/* SECTION TITLE */}

      <SectionLabel
        title="QUARTER FINAL"
        subtitle="8 Players • Knockout Stage"
      />

      {/* BRACKET */}

      <div className="mt-5 flex min-w-[700px] gap-6">

        {/* =========================================
            QUARTER FINALS
        ========================================= */}

        <div className="flex w-[315px] shrink-0 flex-col gap-7">

          {matches.map(
            (match) => (
              <MatchCard
                key={
                  match.id
                }
                match={
                  match
                }
              />
            )
          )}

        </div>

        {/* =========================================
            SEMI FINAL PREVIEW
        ========================================= */}

        <div className="flex w-[315px] shrink-0 flex-col gap-[220px] pt-[90px]">

          <MatchCard
            match={
              semiMatches[0] ||
              matchesToPreview(
                5
              )
            }
          />

          <MatchCard
            match={
              semiMatches[1] ||
              matchesToPreview(
                6
              )
            }
          />

        </div>

      </div>
    </div>
  );
}

/* =========================================================
   SEMI FINAL
========================================================= */

function SemiFinal({
  matches,
  finalMatch,
}: {
  matches: Match[];
  finalMatch: Match;
}) {
  return (
    <div className="relative min-h-[700px] overflow-x-auto px-3 py-5">

      <SectionLabel
        title="SEMI FINAL"
        subtitle="One step away from the Final"
      />

      <div className="mt-6 flex min-w-[700px] justify-center gap-8">

        {/* =========================================
            SEMI FINAL MATCHES
        ========================================= */}

        <div className="flex w-[330px] flex-col gap-[70px] pt-[35px]">

          <LargeMatchCard
            match={
              matches[0]
            }
          />

          <LargeMatchCard
            match={
              matches[1]
            }
          />

        </div>

        {/* =========================================
            FINAL PREVIEW
        ========================================= */}

        <div className="flex w-[330px] items-center">

          <MatchCard
            match={
              finalMatch ||
              matchesToPreview(
                7
              )
            }
          />

        </div>

      </div>
    </div>
  );
}

/* =========================================================
   FINAL
========================================================= */

function FinalMatch({
  match,
}: {
  match: Match;
}) {
  return (
    <div className="min-h-[650px] px-3 py-6">

      {/* TITLE */}

      <div className="text-center">

        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#999999]">
          Championship Match
        </div>

        <div className="mt-1 text-[25px] font-black text-[#111111]">
          GRAND FINAL
        </div>

        <div className="mx-auto mt-2 h-[4px] w-[55px] rounded-full bg-[#FFD600]" />

      </div>

      {/* TROPHY */}

      <div className="mt-6 text-center">

        <div className="text-[48px] leading-none">
          🏆
        </div>

        <div className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#777777]">
          Tournament Champion
        </div>

      </div>

      {/* FINAL CARD */}

      <div className="mt-6 flex justify-center">

        <FinalMatchCard
          match={match}
        />

      </div>

    </div>
  );
}

/* =========================================================
   SECTION LABEL
========================================================= */

function SectionLabel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">

      <div className="h-[35px] w-[6px] rounded-full bg-[#FFD600]" />

      <div>

        <div className="text-[16px] font-black leading-none text-[#111111]">
          {title}
        </div>

        <div className="mt-[4px] text-[10px] font-bold text-[#999999]">
          {subtitle}
        </div>

      </div>

    </div>
  );
}

/* =========================================================
   NORMAL MATCH CARD
========================================================= */

function MatchCard({
  match,
}: {
  match: Match;
}) {
  return (
    <div className="relative w-[315px] overflow-hidden rounded-[16px] border border-[#e2e2e2] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]">

      {/* YELLOW LINE */}

      <div className="h-[4px] w-full bg-[#FFD600]" />

      {/* HEADER */}

      <div className="flex items-center justify-between border-b border-[#eeeeee] px-4 py-[9px]">

        <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[#777777]">
          Match {match.id}
        </div>

        <div className="rounded-full bg-[#111111] px-[9px] py-[3px] text-[8px] font-black uppercase tracking-[0.08em] text-[#FFD600]">
          Knockout
        </div>

      </div>

      {/* PLAYERS */}

      <div className="px-3 py-2">

        <PlayerScoreRow
          player={
            match.player1
          }
          score={
            match.score1
          }
        />

        <div className="mx-[2px] h-px bg-[#eeeeee]" />

        <PlayerScoreRow
          player={
            match.player2
          }
          score={
            match.score2
          }
        />

      </div>
    </div>
  );
}

/* =========================================================
   LARGE SEMI FINAL CARD
========================================================= */

function LargeMatchCard({
  match,
}: {
  match: Match;
}) {
  return (
    <div className="relative w-[330px] overflow-hidden rounded-[20px] bg-[#111111] shadow-[0_8px_22px_rgba(0,0,0,0.20)]">

      {/* YELLOW ACCENT */}

      <div className="absolute right-[-30px] top-[-35px] h-[140px] w-[70px] rotate-[25deg] bg-[#FFD600]" />

      <div className="relative z-10">

        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-white/10 px-4 py-[10px]">

          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#FFD600]">
            Semi Final
          </span>

          <span className="text-[10px] font-black text-white/50">
            MATCH {match.id}
          </span>

        </div>

        {/* MATCH */}

        <div className="flex min-h-[150px] items-center justify-center gap-5 px-4 py-5">

          {/* PLAYER 1 */}

          <div className="flex w-[92px] flex-col items-center">

            <PlayerAvatar
              player={
                match.player1
              }
              large
            />

            <div className="mt-2 w-full truncate text-center text-[12px] font-black text-white">
              {match.player1
                ?.username ||
                "Player 1"}
            </div>

          </div>

          {/* SCORE */}

          <div className="flex shrink-0 items-center gap-[7px]">

            <ScoreBox
              score={
                match.score1
              }
            />

            <div className="text-[12px] font-black text-[#FFD600]">
              VS
            </div>

            <ScoreBox
              score={
                match.score2
              }
            />

          </div>

          {/* PLAYER 2 */}

          <div className="flex w-[92px] flex-col items-center">

            <PlayerAvatar
              player={
                match.player2
              }
              large
            />

            <div className="mt-2 w-full truncate text-center text-[12px] font-black text-white">
              {match.player2
                ?.username ||
                "Player 2"}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   FINAL MATCH CARD
========================================================= */

function FinalMatchCard({
  match,
}: {
  match: Match;
}) {
  return (
    <div className="relative w-full max-w-[370px] overflow-hidden rounded-[24px] bg-[#111111] shadow-[0_12px_30px_rgba(0,0,0,0.25)]">

      {/* BACKGROUND ACCENTS */}

      <div className="absolute -right-[55px] -top-[75px] h-[230px] w-[105px] rotate-[28deg] bg-[#FFD600]" />

      <div className="absolute -bottom-[90px] -left-[70px] h-[190px] w-[100px] rotate-[28deg] bg-[#FFD600]/20" />

      <div className="relative z-10">

        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">

          <div>

            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#FFD600]">
              Championship
            </div>

            <div className="mt-[2px] text-[17px] font-black text-white">
              GRAND FINAL
            </div>

          </div>

          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#FFD600] text-[20px] shadow">
            🏆
          </div>

        </div>

        {/* PLAYERS */}

        <div className="flex min-h-[210px] items-center justify-between px-5 py-6">

          {/* PLAYER 1 */}

          <div className="flex w-[95px] flex-col items-center">

            <div className="rounded-full border-[3px] border-[#FFD600] p-[2px]">

              <PlayerAvatar
                player={
                  match.player1
                }
                final
              />

            </div>

            <div className="mt-3 w-full truncate text-center text-[13px] font-black text-white">
              {match.player1
                ?.username ||
                "Player 1"}
            </div>

          </div>

          {/* SCORE */}

          <div className="flex flex-col items-center">

            <div className="text-[9px] font-black uppercase tracking-[0.15em] text-white/40">
              Final Score
            </div>

            <div className="mt-3 flex items-center gap-2">

              <FinalScoreBox
                score={
                  match.score1
                }
              />

              <span className="text-[13px] font-black text-[#FFD600]">
                -
              </span>

              <FinalScoreBox
                score={
                  match.score2
                }
              />

            </div>

            <div className="mt-4 text-[29px] leading-none">
              🏆
            </div>

          </div>

          {/* PLAYER 2 */}

          <div className="flex w-[95px] flex-col items-center">

            <div className="rounded-full border-[3px] border-[#FFD600] p-[2px]">

              <PlayerAvatar
                player={
                  match.player2
                }
                final
              />

            </div>

            <div className="mt-3 w-full truncate text-center text-[13px] font-black text-white">
              {match.player2
                ?.username ||
                "Player 2"}
            </div>

          </div>

        </div>

        {/* FOOTER */}

        <div className="bg-[#FFD600] py-[9px] text-center text-[10px] font-black uppercase tracking-[0.18em] text-[#111111]">
          Play • Compete • Win
        </div>

      </div>
    </div>
  );
}

/* =========================================================
   PLAYER SCORE ROW
========================================================= */

function PlayerScoreRow({
  player,
  score,
}: {
  player: Player | null;
  score: number | null;
}) {
  return (
    <div className="flex h-[45px] items-center">

      {/* PROFILE */}

      <PlayerAvatar
        player={player}
      />

      {/* USERNAME */}

      <div
        className={`ml-3 min-w-0 flex-1 truncate text-[13px] font-black ${
          player
            ? "text-[#111111]"
            : "text-[#aaaaaa]"
        }`}
      >
        {player?.username ||
          "Waiting for player"}
      </div>

      {/* SCORE */}

      <div
        className={`ml-2 flex h-[29px] min-w-[29px] items-center justify-center rounded-[7px] px-[7px] text-[13px] font-black ${
          score !== null
            ? "bg-[#FFD600] text-[#111111]"
            : "bg-[#f0f0f0] text-[#aaaaaa]"
        }`}
      >
        {score ?? "-"}
      </div>

    </div>
  );
}

/* =========================================================
   SCORE BOX
========================================================= */

function ScoreBox({
  score,
}: {
  score: number | null;
}) {
  return (
    <div className="flex h-[37px] min-w-[37px] items-center justify-center rounded-[9px] bg-[#FFD600] px-2 text-[18px] font-black text-[#111111] shadow">
      {score ?? "-"}
    </div>
  );
}

/* =========================================================
   FINAL SCORE BOX
========================================================= */

function FinalScoreBox({
  score,
}: {
  score: number | null;
}) {
  return (
    <div className="flex h-[48px] min-w-[48px] items-center justify-center rounded-[12px] bg-[#FFD600] px-2 text-[25px] font-black text-[#111111] shadow-[0_4px_10px_rgba(0,0,0,0.25)]">
      {score ?? "-"}
    </div>
  );
}

/* =========================================================
   PLAYER AVATAR
========================================================= */

function PlayerAvatar({
  player,
  large = false,
  final = false,
}: {
  player: Player | null;
  large?: boolean;
  final?: boolean;
}) {
  const size = final
    ? "h-[58px] w-[58px]"
    : large
    ? "h-[46px] w-[46px]"
    : "h-[31px] w-[31px]";

  /* NO PROFILE PHOTO */

  if (
    !player?.profilePhoto
  ) {
    return (
      <div
        className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#FFD600] bg-[#f1f1f1] text-[14px]`}
      >
        👤
      </div>
    );
  }

  /* PROFILE PHOTO */

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full border border-[#FFD600] bg-white ${size}`}
    >
      <img
        src={
          player.profilePhoto
        }
        alt={
          player.username
        }
        className="h-full w-full object-cover"
      />
    </div>
  );
}

/* =========================================================
   EMPTY MATCH PREVIEW
========================================================= */

function matchesToPreview(
  id: number
): Match {
  return {
    id,
    player1: null,
    player2: null,
    score1: null,
    score2: null,
  };
}