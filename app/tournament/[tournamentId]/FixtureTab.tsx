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

  roomCode?: string;
  roomCodeA?: string;
  roomCodeB?: string;

  semiFinalRoomCode?: string;

  // Old field fallback
  finalRoomCode?: string;
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
  | "round16"
  | "quarter"
  | "semi"
  | "final";

type Props = {
  tournament: Tournament;
};

/* =========================================================
   MAIN FIXTURE TAB
========================================================= */

export default function FixtureTab({
  tournament,
}: Props) {
  const [players, setPlayers] =
    useState<Player[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [activeRound, setActiveRound] =
    useState<Round>("round16");

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

  const [
    semiFinalRoomCode,
    setSemiFinalRoomCode,
  ] = useState("");

  /* =========================================================
     REALTIME TOURNAMENT LISTENER
  ========================================================= */

  useEffect(() => {
    const tournamentRef = doc(
      db,
      "tournaments",
      tournament.id
    );

    const unsubscribe = onSnapshot(
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

        setSemiFinalRoomCode(
          data.semiFinalRoomCode ||
            data.finalRoomCode ||
            ""
        );
      },

      (error) => {
        console.error(
          "Failed to listen to tournament fixture:",
          error
        );
      }
    );

    return () => unsubscribe();
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

        /* Keep registration order */

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
          /* Confirmed players only */

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

          /*
           * Registration already contains
           * player data
           */

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

          /*
           * Fallback users collection
           */

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
              16
            )
          );
        }
      } catch (error) {
        console.error(
          "Failed to load fixture players:",
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

  const playerMap = useMemo(
    () => {
      const map = new Map<
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
    },
    [players]
  );

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
      playerMap.get(playerId) ||
      null
    );
  }

  /* =========================================================
     SAVED SCORE

     Supports:
     scores.1

     and old:
     scores.match1
  ========================================================= */

  function getSavedScore(
    matchId: number
  ): SavedScore | null {
    return (
      scores[String(matchId)] ||
      scores[`match${matchId}`] ||
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
     PENALTY WINNER
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
     GET WINNER
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
      ) || defaultPlayer1;

    const player2 =
      getSavedPlayer(
        savedPlayers?.player2Id
      ) || defaultPlayer2;

    const score =
      getSavedScore(matchId);

    if (
      !player1 ||
      !player2
    ) {
      return null;
    }

    if (!score) {
      return null;
    }

    if (
      score.p1Score >
      score.p2Score
    ) {
      return player1;
    }

    if (
      score.p2Score >
      score.p1Score
    ) {
      return player2;
    }

    /*
     * Draw -> penalty winner
     */

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
     ROUND OF 16
     MATCH 1 - 8
  ========================================================= */

  const round16Matches =
    useMemo<Match[]>(() => {
      return Array.from(
        { length: 8 },
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
              savedPlayers?.player1Id
            ) ||
            defaultPlayer1;

          const player2 =
            getSavedPlayer(
              savedPlayers?.player2Id
            ) ||
            defaultPlayer2;

          return {
            id: matchId,

            player1,

            player2,

            score1:
              savedScore?.p1Score ??
              null,

            score2:
              savedScore?.p2Score ??
              null,
          };
        }
      );
    }, [
      players,
      scores,
      matchPlayers,
      penaltyWinners,
      playerMap,
    ]);

  /* =========================================================
     QUARTER FINAL

     9  = Winner 1 vs Winner 2
     10 = Winner 3 vs Winner 4
     11 = Winner 5 vs Winner 6
     12 = Winner 7 vs Winner 8
  ========================================================= */

  const quarterMatches =
    useMemo<Match[]>(() => {
      const pairings = [
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8],
      ];

      return pairings.map(
        (
          [matchA, matchB],
          index
        ) => {
          const matchId =
            9 + index;

          const sourceA =
            round16Matches.find(
              (match) =>
                match.id ===
                matchA
            );

          const sourceB =
            round16Matches.find(
              (match) =>
                match.id ===
                matchB
            );

          const player1 =
            getWinner(
              matchA,
              sourceA?.player1 ||
                null,
              sourceA?.player2 ||
                null
            );

          const player2 =
            getWinner(
              matchB,
              sourceB?.player1 ||
                null,
              sourceB?.player2 ||
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
              savedPlayers?.player1Id
            ) || player1;

          const finalPlayer2 =
            getSavedPlayer(
              savedPlayers?.player2Id
            ) || player2;

          return {
            id: matchId,

            player1:
              finalPlayer1,

            player2:
              finalPlayer2,

            score1:
              savedScore?.p1Score ??
              null,

            score2:
              savedScore?.p2Score ??
              null,
          };
        }
      );
    }, [
      round16Matches,
      scores,
      matchPlayers,
      penaltyWinners,
      playerMap,
    ]);

  /* =========================================================
     SEMI FINAL

     13 = Winner 9 vs Winner 10
     14 = Winner 11 vs Winner 12
  ========================================================= */

  const semiMatches =
    useMemo<Match[]>(() => {
      const pairings = [
        [9, 10],
        [11, 12],
      ];

      return pairings.map(
        (
          [matchA, matchB],
          index
        ) => {
          const matchId =
            13 + index;

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

          const player1 =
            getWinner(
              matchA,
              sourceA?.player1 ||
                null,
              sourceA?.player2 ||
                null
            );

          const player2 =
            getWinner(
              matchB,
              sourceB?.player1 ||
                null,
              sourceB?.player2 ||
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
              savedPlayers?.player1Id
            ) || player1;

          const finalPlayer2 =
            getSavedPlayer(
              savedPlayers?.player2Id
            ) || player2;

          return {
            id: matchId,

            player1:
              finalPlayer1,

            player2:
              finalPlayer2,

            score1:
              savedScore?.p1Score ??
              null,

            score2:
              savedScore?.p2Score ??
              null,
          };
        }
      );
    }, [
      quarterMatches,
      scores,
      matchPlayers,
      penaltyWinners,
      playerMap,
    ]);

  /* =========================================================
     GRAND FINAL
     MATCH 15
  ========================================================= */

  const finalMatch =
    useMemo<Match>(() => {
      const player1 =
        getWinner(
          13,
          semiMatches[0]
            ?.player1 || null,
          semiMatches[0]
            ?.player2 || null
        );

      const player2 =
        getWinner(
          14,
          semiMatches[1]
            ?.player1 || null,
          semiMatches[1]
            ?.player2 || null
        );

      const savedPlayers =
        getSavedMatchPlayers(15);

      const savedScore =
        getSavedScore(15);

      const finalPlayer1 =
        getSavedPlayer(
          savedPlayers?.player1Id
        ) || player1;

      const finalPlayer2 =
        getSavedPlayer(
          savedPlayers?.player2Id
        ) || player2;

      return {
        id: 15,

        player1:
          finalPlayer1,

        player2:
          finalPlayer2,

        score1:
          savedScore?.p1Score ??
          null,

        score2:
          savedScore?.p2Score ??
          null,
      };
    }, [
      semiMatches,
      scores,
      matchPlayers,
      penaltyWinners,
      playerMap,
    ]);

  /* =========================================================
     SEMI FINAL ROOM CODE
  ========================================================= */

  const displaySemiFinalRoomCode =
    semiFinalRoomCode ||
    "Semi Final Room Code";

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
     MAIN UI
  ========================================================= */

  return (
    <div className="min-h-[700px] overflow-hidden bg-[#f2f2f2]">

      {/* =================================================
          ROUND HEADER
      ================================================= */}

      <div className="sticky top-0 z-40 border-b border-[#dddddd] bg-[#f2f2f2]/95 px-3 py-3 backdrop-blur-sm">

        <div className="flex gap-2 overflow-x-auto scrollbar-none">

          <RoundTab
            label="Round of 16"
            active={
              activeRound ===
              "round16"
            }
            onClick={() =>
              setActiveRound(
                "round16"
              )
            }
          />

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
          ROUND CONTENT
      ================================================= */}

      {activeRound ===
        "round16" && (
        <RoundOf16
          matches={
            round16Matches
          }
          quarterMatches={
            quarterMatches
          }
        />
      )}

      {activeRound ===
        "quarter" && (
        <QuarterFinal
          matches={
            quarterMatches
          }
        />
      )}

      {activeRound ===
        "semi" && (
        <SemiFinal
          matches={
            semiMatches
          }
          roomCode={
            displaySemiFinalRoomCode
          }
        />
      )}

      {activeRound ===
        "final" && (
        <FinalMatch
          match={finalMatch}
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
   ROUND OF 16
========================================================= */

function RoundOf16({
  matches,
  quarterMatches,
}: {
  matches: Match[];
  quarterMatches: Match[];
}) {
  return (
    <div className="relative min-h-[1000px] overflow-x-auto px-3 py-5">

      {/* ROUND LABEL */}

      <SectionLabel
        title="ROUND OF 16"
        subtitle="Knockout Stage"
      />

      <div className="relative mt-5 flex min-w-[760px] gap-6">

        {/* ROUND 16 */}

        <div className="flex w-[315px] shrink-0 flex-col gap-7">

          {matches
            .slice(0, 4)
            .map((match) => (
              <MatchCard
                key={match.id}
                match={match}
              />
            ))}

          <div className="h-10" />

          {matches
            .slice(4, 8)
            .map((match) => (
              <MatchCard
                key={match.id}
                match={match}
              />
            ))}

        </div>

        {/* QUARTER PREVIEW */}

        <div className="flex w-[315px] shrink-0 flex-col gap-[115px] pt-[76px]">

          <MatchCard
            match={
              quarterMatches.find(
                (match) =>
                  match.id === 9
              ) ||
              matchesToPreview(9)
            }
          />

          <MatchCard
            match={
              quarterMatches.find(
                (match) =>
                  match.id === 10
              ) ||
              matchesToPreview(
                10
              )
            }
          />

          <div className="h-12" />

          <MatchCard
            match={
              quarterMatches.find(
                (match) =>
                  match.id === 11
              ) ||
              matchesToPreview(
                11
              )
            }
          />

          <MatchCard
            match={
              quarterMatches.find(
                (match) =>
                  match.id === 12
              ) ||
              matchesToPreview(
                12
              )
            }
          />

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PREVIEW MATCH
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

/* =========================================================
   QUARTER FINAL
========================================================= */

function QuarterFinal({
  matches,
}: {
  matches: Match[];
}) {
  return (
    <div className="relative min-h-[900px] overflow-x-auto px-3 py-5">

      <SectionLabel
        title="QUARTER FINAL"
        subtitle="Road to the Semi-final"
      />

      <div className="mt-5 flex min-w-[700px] gap-6">

        <div className="flex w-[315px] shrink-0 flex-col gap-7">

          {matches.map(
            (match) => (
              <div
                key={match.id}
                className={
                  match.id === 11
                    ? "mt-10"
                    : ""
                }
              >
                <MatchCard
                  match={match}
                />
              </div>
            )
          )}

        </div>

        {/* SEMI PREVIEW */}

        <div className="flex w-[315px] shrink-0 flex-col gap-[250px] pt-[90px]">

          <MatchCard
            match={matchesToPreview(
              13
            )}
          />

          <MatchCard
            match={matchesToPreview(
              14
            )}
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
  roomCode,
}: {
  matches: Match[];
  roomCode: string;
}) {
  return (
    <div className="min-h-[650px] px-4 py-6">

      <SectionLabel
        title="SEMI FINAL"
        subtitle="One step away from the Final"
      />

      {/* ROOM CODE */}

      <div className="mt-5 flex items-center justify-center">

        <div className="w-full max-w-[330px] overflow-hidden rounded-[13px] border-2 border-[#111111] bg-[#FFD600] shadow-[0_4px_12px_rgba(0,0,0,0.12)]">

          <div className="bg-[#111111] py-[5px] text-center text-[9px] font-black uppercase tracking-[0.18em] text-[#FFD600]">
            Semi Final Room Code
          </div>

          <div className="flex min-h-[42px] items-center justify-center px-4 text-center text-[15px] font-black tracking-[0.05em] text-[#111111]">
            {roomCode}
          </div>

        </div>
      </div>

      {/* MATCHES */}

      <div className="mt-8 flex items-start justify-center">

        <div className="flex flex-col gap-6">

          <LargeMatchCard
            match={matches[0]}
          />

          <LargeMatchCard
            match={matches[1]}
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

      <div className="text-center">

        <div className="text-[11px] font-black uppercase tracking-[0.25em] text-[#999999]">
          Championship Match
        </div>

        <div className="mt-1 text-[25px] font-black text-[#111111]">
          GRAND FINAL
        </div>

        <div className="mx-auto mt-2 h-[4px] w-[55px] rounded-full bg-[#FFD600]" />

      </div>

      {/* TROPHY */}

      <div className="mt-6 text-center">
        <div className="text-[46px] leading-none">
          🏆
        </div>

        <div className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#777777]">
          Tournament Champion
        </div>
      </div>

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

      {/* YELLOW TOP LINE */}

      <div className="h-[4px] w-full bg-[#FFD600]" />

      {/* MATCH HEADER */}

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
          player={match.player1}
          score={match.score1}
        />

        <div className="mx-[2px] h-px bg-[#eeeeee]" />

        <PlayerScoreRow
          player={match.player2}
          score={match.score2}
        />

      </div>
    </div>
  );
}

/* =========================================================
   LARGE SEMI FINAL MATCH CARD
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

        {/* CONTENT */}

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

            <div className="text-[13px] font-black text-[#FFD600]">
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
   FINAL CARD
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

        {/* FINAL HEADER */}

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

          {/* CENTER SCORE */}

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

        {/* BOTTOM */}

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

      {/* AVATAR */}

      <PlayerAvatar
        player={player}
      />

      {/* NAME */}

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

  if (!player?.profilePhoto) {
    return (
      <div
        className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#FFD600] bg-[#f1f1f1] text-[14px]`}
      >
        👤
      </div>
    );
  }

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