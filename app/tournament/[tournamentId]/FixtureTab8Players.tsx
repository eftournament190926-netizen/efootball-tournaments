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

type Round = "quarter" | "semi" | "final";

type Props = {
  tournament: Tournament;
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function FixtureTab8Players({
  tournament,
}: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeRound, setActiveRound] =
    useState<Round>("quarter");

  const [scores, setScores] =
    useState<Record<string, SavedScore>>({});

  const [matchPlayers, setMatchPlayers] =
    useState<Record<string, SavedMatchPlayers>>({});

  const [penaltyWinners, setPenaltyWinners] =
    useState<Record<string, string>>({});

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

        const data = snapshot.data();

        setScores(
          (data.scores || {}) as Record<
            string,
            SavedScore
          >
        );

        setMatchPlayers(
          (data.matchPlayers || {}) as Record<
            string,
            SavedMatchPlayers
          >
        );

        setPenaltyWinners(
          (data.penaltyWinners || {}) as Record<
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

        const registrationsQuery = query(
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
          await getDocs(registrationsQuery);

        const registrations: Registration[] =
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              Registration,
              "id"
            >),
          }));

        registrations.sort((a, b) => {
          const aTime =
            a.createdAt?.seconds ?? 0;

          const bTime =
            b.createdAt?.seconds ?? 0;

          return aTime - bTime;
        });

        const loadedPlayers: Player[] = [];

        for (const registration of registrations) {
          if (
            registration.status &&
            registration.status !== "confirmed"
          ) {
            continue;
          }

          const uid =
            registration.userId ||
            registration.uid;

          /*
           * Registration already contains
           * player information.
           */
          if (registration.username) {
            loadedPlayers.push({
              id: uid || registration.id,
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
           * Fallback users collection.
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

            if (!userSnapshot.empty) {
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
            loadedPlayers.slice(0, 8)
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

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();

    for (const player of players) {
      map.set(player.id, player);
    }

    return map;
  }, [players]);

  /* =========================================================
     PLAYER LOOKUP
  ========================================================= */

  function getSavedPlayer(
    playerId: string | null | undefined
  ): Player | null {
    if (!playerId) {
      return null;
    }

    return playerMap.get(playerId) || null;
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
      matchPlayers[String(matchId)] ||
      matchPlayers[`match${matchId}`] ||
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
      penaltyWinners[String(matchId)] ||
      penaltyWinners[`match${matchId}`] ||
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
      getSavedMatchPlayers(matchId);

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

    if (!player1 || !player2) {
      return null;
    }

    if (!score) {
      return null;
    }

    if (score.p1Score > score.p2Score) {
      return player1;
    }

    if (score.p2Score > score.p1Score) {
      return player2;
    }

    /*
     * DRAW
     *
     * Use penalty winner.
     */
    const penaltyWinner =
      getSavedPenaltyWinner(matchId);

    if (!penaltyWinner) {
      return null;
    }

    if (penaltyWinner === player1.id) {
      return player1;
    }

    if (penaltyWinner === player2.id) {
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
    useMemo<Match[]>(() => {
      return Array.from(
        { length: 4 },
        (_, index) => {
          const matchId = index + 1;

          const defaultPlayer1 =
            players[index * 2] || null;

          const defaultPlayer2 =
            players[index * 2 + 1] ||
            null;

          const savedPlayers =
            getSavedMatchPlayers(matchId);

          const savedScore =
            getSavedScore(matchId);

          const player1 =
            getSavedPlayer(
              savedPlayers?.player1Id
            ) || defaultPlayer1;

          const player2 =
            getSavedPlayer(
              savedPlayers?.player2Id
            ) || defaultPlayer2;

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
     SEMI FINAL
     
     Match 5 = Winner 1 vs Winner 2
     Match 6 = Winner 3 vs Winner 4
  ========================================================= */

  const semiMatches =
    useMemo<Match[]>(() => {
      const pairings = [
        [1, 2],
        [3, 4],
      ];

      return pairings.map(
        ([matchA, matchB], index) => {
          const matchId = 5 + index;

          const sourceA =
            quarterMatches.find(
              (match) =>
                match.id === matchA
            );

          const sourceB =
            quarterMatches.find(
              (match) =>
                match.id === matchB
            );

          /*
           * IMPORTANT:
           *
           * getWinner() checks both normal score
           * and penalty winner.
           */
          const player1 =
            getWinner(
              matchA,
              sourceA?.player1 || null,
              sourceA?.player2 || null
            );

          const player2 =
            getWinner(
              matchB,
              sourceB?.player1 || null,
              sourceB?.player2 || null
            );

          const savedPlayers =
            getSavedMatchPlayers(matchId);

          const savedScore =
            getSavedScore(matchId);

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
            player1: finalPlayer1,
            player2: finalPlayer2,
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
     FINAL
     
     Match 7 = Winner 5 vs Winner 6
  ========================================================= */

  const finalMatch =
    useMemo<Match>(() => {
      const player1 =
        getWinner(
          5,
          semiMatches[0]?.player1 ||
            null,
          semiMatches[0]?.player2 ||
            null
        );

      const player2 =
        getWinner(
          6,
          semiMatches[1]?.player1 ||
            null,
          semiMatches[1]?.player2 ||
            null
        );

      const savedPlayers =
        getSavedMatchPlayers(7);

      const savedScore =
        getSavedScore(7);

      const finalPlayer1 =
        getSavedPlayer(
          savedPlayers?.player1Id
        ) || player1;

      const finalPlayer2 =
        getSavedPlayer(
          savedPlayers?.player2Id
        ) || player2;

      return {
        id: 7,
        player1: finalPlayer1,
        player2: finalPlayer2,
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
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="min-h-[500px] bg-[#eeeeee]">
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#4bd17b] border-t-transparent" />
        </div>
      </div>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="min-h-[700px] overflow-hidden bg-[#eeeeee]">

      {/* =================================================
          ROUND HEADER
      ================================================= */}

      <div className="sticky top-0 z-40 border-b border-[#dddddd] bg-[#eeeeee]/95 px-2 py-3 backdrop-blur-sm">

        <div className="flex gap-3 overflow-x-auto scrollbar-none">

          <RoundTab
            label="Quarter-final"
            active={
              activeRound === "quarter"
            }
            onClick={() =>
              setActiveRound("quarter")
            }
          />

          <RoundTab
            label="Semi-final"
            active={
              activeRound === "semi"
            }
            onClick={() =>
              setActiveRound("semi")
            }
          />

          <RoundTab
            label="Final"
            active={
              activeRound === "final"
            }
            onClick={() =>
              setActiveRound("final")
            }
          />

        </div>
      </div>

      {/* =================================================
          QUARTER FINAL
      ================================================= */}

      {activeRound === "quarter" && (
        <QuarterFinal
          matches={quarterMatches}
          semiMatches={semiMatches}
        />
      )}

      {/* =================================================
          SEMI FINAL
      ================================================= */}

      {activeRound === "semi" && (
        <SemiFinal
          matches={semiMatches}
        />
      )}

      {/* =================================================
          FINAL
      ================================================= */}

      {activeRound === "final" && (
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
      className={`shrink-0 rounded-full px-7 py-3 text-[14px] font-bold transition ${
        active
          ? "bg-white text-[#222222] shadow-sm"
          : "bg-[#e2e2e2] text-[#222222]"
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
    <div className="relative min-h-[850px] overflow-x-auto px-2 py-6">

      <div className="flex min-w-[700px] gap-6">

        {/* ===============================================
            QUARTER FINALS
        =============================================== */}

        <div className="flex w-[315px] shrink-0 flex-col gap-7">

          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
            />
          ))}

        </div>

        {/* ===============================================
            SEMI FINAL PREVIEW
        =============================================== */}

        <div className="flex w-[315px] shrink-0 flex-col gap-[220px] pt-[90px]">

          <MatchCard
            match={semiMatches[0]}
          />

          <MatchCard
            match={semiMatches[1]}
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
}: {
  matches: Match[];
}) {
  return (
    <div className="relative min-h-[700px] overflow-x-auto px-2 py-6">

      <div className="flex min-w-[700px] justify-center gap-8">

        {/* ===============================================
            SEMI FINALS
        =============================================== */}

        <div className="flex w-[315px] flex-col gap-[220px] pt-[80px]">

          <MatchCard
            match={matches[0]}
          />

          <MatchCard
            match={matches[1]}
          />

        </div>

        {/* ===============================================
            FINAL PREVIEW
        =============================================== */}

        <div className="flex w-[315px] items-center">

          <MatchCard
            match={matchesToPreview(7)}
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

      <div className="flex justify-center">

        <FinalMatchCard
          match={match}
        />

      </div>

    </div>
  );
}

/* =========================================================
   MATCH CARD
========================================================= */

function MatchCard({
  match,
}: {
  match: Match;
}) {
  return (
    <div className="w-[315px] rounded-[16px] bg-white px-4 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">

      <div className="mb-3 text-[16px] font-medium text-[#888888]">
        Match {match.id}
      </div>

      <PlayerScoreRow
        player={match.player1}
        score={match.score1}
      />

      <PlayerScoreRow
        player={match.player2}
        score={match.score2}
      />

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
    <div className="relative h-[205px] w-[350px] overflow-hidden rounded-[22px] bg-gradient-to-r from-[#304f7c] via-[#9d9cae] to-[#d20c18]">

      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/20" />

      <div className="flex h-full items-center justify-center gap-8">

        {/* PLAYER 1 */}

        <div className="flex w-[85px] flex-col items-center">

          <PlayerAvatar
            player={match.player1}
            large
          />

          <div className="mt-2 max-w-[85px] truncate text-[15px] font-bold text-white">
            {match.player1?.username ||
              "Player 1"}
          </div>

        </div>

        {/* SCORE */}

        <div className="flex flex-col items-center">

          <div className="text-[30px] font-black text-white">
            {match.score1 ?? "-"}
          </div>

          <div className="my-1 text-[42px] leading-none">
            🏆
          </div>

          <div className="text-[30px] font-black text-white">
            {match.score2 ?? "-"}
          </div>

        </div>

        {/* PLAYER 2 */}

        <div className="flex w-[85px] flex-col items-center">

          <PlayerAvatar
            player={match.player2}
            large
          />

          <div className="mt-2 max-w-[85px] truncate text-[15px] font-bold text-white">
            {match.player2?.username ||
              "Player 2"}
          </div>

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
    <div className="flex h-[36px] items-center">

      <PlayerAvatar
        player={player}
      />

      <div className="ml-3 min-w-0 flex-1 truncate text-[16px] font-medium text-[#111111]">
        {player?.username ||
          "Waiting for player"}
      </div>

      <div className="ml-2 w-[25px] text-right text-[16px] font-medium text-[#444444]">
        {score ?? ""}
      </div>

    </div>
  );
}

/* =========================================================
   PLAYER AVATAR
========================================================= */

function PlayerAvatar({
  player,
  large = false,
}: {
  player: Player | null;
  large?: boolean;
}) {
  const size = large
    ? "h-[42px] w-[42px]"
    : "h-[30px] w-[30px]";

  if (!player?.profilePhoto) {
    return (
      <div
        className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-[#eeeeee] text-[13px]`}
      >
        👤
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-full border border-white bg-white ${size}`}
    >
      <img
        src={player.profilePhoto}
        alt=""
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