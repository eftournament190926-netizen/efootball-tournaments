
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
  title: string;
  player1: Player | null;
  player2: Player | null;
  score1: number | null;
  score2: number | null;
};

type Round = "semi" | "final";

type Props = {
  tournament: Tournament;
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function FixtureTab4Players({
  tournament,
}: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeRound, setActiveRound] =
    useState<Round>("semi");

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
      "moneyTournaments",
      tournament.id
    );

    const unsubscribe = onSnapshot(
      tournamentRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setScores(
          (data.scores || {}) as Record<string, SavedScore>
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
          "Failed to listen to 4-player fixture:",
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
            "moneyTournamentRegistrations"
          ),
          where("tournamentId", "==", tournament.id)
        );

        const snapshot = await getDocs(
          registrationsQuery
        );

        const registrations: Registration[] =
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Registration, "id">),
          }));

        registrations.sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;

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
            registration.userId || registration.uid;

          if (registration.username) {
            loadedPlayers.push({
              id: uid || registration.id,
              username: registration.username,
              profilePhoto:
                registration.profilePhoto || "",
            });

            continue;
          }

          if (!uid) continue;

          try {
            const userSnapshot = await getDocs(
              query(
                collection(db, "users"),
                where("uid", "==", uid)
              )
            );

            if (!userSnapshot.empty) {
              const userData =
                userSnapshot.docs[0].data();

              loadedPlayers.push({
                id: uid,
                username: userData.username || "Player",
                profilePhoto:
                  userData.profilePhoto || "",
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
          setPlayers(loadedPlayers.slice(0, 4));
        }
      } catch (error) {
        console.error(
          "Failed to load 4-player fixture:",
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

    players.forEach((player) => {
      map.set(player.id, player);
    });

    return map;
  }, [players]);

  function getSavedPlayer(
    playerId: string | null | undefined
  ): Player | null {
    if (!playerId) return null;

    return playerMap.get(playerId) || null;
  }

  /* =========================================================
     SAVED DATA HELPERS
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

  function getSavedMatchPlayers(
    matchId: number
  ): SavedMatchPlayers | null {
    return (
      matchPlayers[String(matchId)] ||
      matchPlayers[`match${matchId}`] ||
      null
    );
  }

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
      getSavedPlayer(savedPlayers?.player1Id) ||
      defaultPlayer1;

    const player2 =
      getSavedPlayer(savedPlayers?.player2Id) ||
      defaultPlayer2;

    const score = getSavedScore(matchId);

    if (!player1 || !player2 || !score) {
      return null;
    }

    if (score.p1Score > score.p2Score) {
      return player1;
    }

    if (score.p2Score > score.p1Score) {
      return player2;
    }

    const penaltyWinner =
      getSavedPenaltyWinner(matchId);

    if (penaltyWinner === player1.id) {
      return player1;
    }

    if (penaltyWinner === player2.id) {
      return player2;
    }

    return null;
  }

  /* =========================================================
     SEMI FINAL 1
     MATCH 1 = PLAYER 1 VS PLAYER 2
  ========================================================= */

  const semiMatch1 = useMemo<Match>(() => {
    const savedPlayers = getSavedMatchPlayers(1);
    const score = getSavedScore(1);

    return {
      id: 1,
      title: "SEMI FINAL 1",

      player1:
        getSavedPlayer(savedPlayers?.player1Id) ||
        players[0] ||
        null,

      player2:
        getSavedPlayer(savedPlayers?.player2Id) ||
        players[1] ||
        null,

      score1: score?.p1Score ?? null,
      score2: score?.p2Score ?? null,
    };
  }, [players, scores, matchPlayers, playerMap]);

  /* =========================================================
     SEMI FINAL 2
     MATCH 2 = PLAYER 3 VS PLAYER 4
  ========================================================= */

  const semiMatch2 = useMemo<Match>(() => {
    const savedPlayers = getSavedMatchPlayers(2);
    const score = getSavedScore(2);

    return {
      id: 2,
      title: "SEMI FINAL 2",

      player1:
        getSavedPlayer(savedPlayers?.player1Id) ||
        players[2] ||
        null,

      player2:
        getSavedPlayer(savedPlayers?.player2Id) ||
        players[3] ||
        null,

      score1: score?.p1Score ?? null,
      score2: score?.p2Score ?? null,
    };
  }, [players, scores, matchPlayers, playerMap]);

  /* =========================================================
     GRAND FINAL
     MATCH 3 = WINNER MATCH 1 VS WINNER MATCH 2
  ========================================================= */

  const finalMatch = useMemo<Match>(() => {
    const winner1 = getWinner(
      1,
      semiMatch1.player1,
      semiMatch1.player2
    );

    const winner2 = getWinner(
      2,
      semiMatch2.player1,
      semiMatch2.player2
    );

    const savedPlayers = getSavedMatchPlayers(3);
    const score = getSavedScore(3);

    return {
      id: 3,
      title: "GRAND FINAL",

      player1:
        getSavedPlayer(savedPlayers?.player1Id) ||
        winner1,

      player2:
        getSavedPlayer(savedPlayers?.player2Id) ||
        winner2,

      score1: score?.p1Score ?? null,
      score2: score?.p2Score ?? null,
    };
  }, [
    semiMatch1,
    semiMatch2,
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
      <div className="flex min-h-[350px] flex-col items-center justify-center bg-[#f2f2f2]">
        <div className="h-8 w-8 animate-spin rounded-full border-[4px] border-[#dddddd] border-t-[#FFD600]" />

        <p className="mt-3 text-[11px] font-black text-[#777777]">
          Loading fixture...
        </p>
      </div>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="min-h-[600px] overflow-hidden bg-[#f2f2f2]">

      {/* ROUND TABS */}

      <div className="sticky top-0 z-40 border-b border-[#dddddd] bg-[#f2f2f2]/95 px-3 py-3 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2">

          <RoundTab
            label="Semi Final"
            active={activeRound === "semi"}
            onClick={() => setActiveRound("semi")}
          />

          <RoundTab
            label="Grand Final"
            active={activeRound === "final"}
            onClick={() => setActiveRound("final")}
          />

        </div>
      </div>

      {/* SEMI FINALS */}

      {activeRound === "semi" && (
        <div className="px-3 py-6">

          <SectionLabel
            title="SEMI FINALS"
            subtitle="4 Players • Knockout Stage"
          />

          <div className="mt-6 flex flex-col gap-5">

            <LargeMatchCard match={semiMatch1} />

            <LargeMatchCard match={semiMatch2} />

          </div>

          <div className="mt-6 rounded-[14px] border border-[#e5e5e5] bg-white p-4 text-center">
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[#999999]">
              Next Stage
            </p>

            <p className="mt-1 text-[15px] font-black text-[#111111]">
              Winners advance to Grand Final
            </p>
          </div>

        </div>
      )}

      {/* GRAND FINAL */}

      {activeRound === "final" && (
        <div className="px-3 py-6">

          <SectionLabel
            title="GRAND FINAL"
            subtitle="Championship Match"
          />

          <div className="mt-6 text-center">
            <div className="text-[48px]">🏆</div>

            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#777777]">
              Tournament Champion
            </p>
          </div>

          <div className="mt-6">
            <FinalMatchCard match={finalMatch} />
          </div>

        </div>
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
      className={`rounded-full border px-3 py-3 text-[13px] font-black transition active:scale-[0.97] ${
        active
          ? "border-[#FFD600] bg-[#FFD600] text-[#111111] shadow"
          : "border-[#d7d7d7] bg-white text-[#777777]"
      }`}
    >
      {label}
    </button>
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

        <div className="mt-[5px] text-[10px] font-bold text-[#999999]">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   LARGE MATCH CARD
========================================================= */

function LargeMatchCard({
  match,
}: {
  match: Match;
}) {
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-[#111111] shadow-[0_8px_22px_rgba(0,0,0,0.16)]">

      <div className="absolute right-[-30px] top-[-35px] h-[140px] w-[70px] rotate-[25deg] bg-[#FFD600]" />

      <div className="relative z-10">

        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#FFD600]">
            {match.title}
          </span>

          <span className="text-[10px] font-black text-white/50">
            MATCH {match.id}
          </span>
        </div>

        <div className="flex min-h-[170px] items-center justify-between gap-2 px-3 py-6">

          <PlayerBlock player={match.player1} />

          <div className="flex shrink-0 flex-col items-center">
            <span className="mb-2 text-[9px] font-black uppercase tracking-[0.15em] text-white/40">
              Score
            </span>

            <div className="flex items-center gap-2">
              <ScoreBox score={match.score1} />

              <span className="text-[12px] font-black text-[#FFD600]">
                VS
              </span>

              <ScoreBox score={match.score2} />
            </div>
          </div>

          <PlayerBlock player={match.player2} />

        </div>

        <div className="bg-white/5 px-4 py-2 text-center">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/50">
            Play • Compete • Win
          </span>
        </div>

      </div>
    </div>
  );
}

/* =========================================================
   PLAYER BLOCK
========================================================= */

function PlayerBlock({
  player,
}: {
  player: Player | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">

      <PlayerAvatar player={player} large />

      <p className="mt-3 w-full truncate text-center text-[11px] font-black text-white">
        {player?.username || "Waiting for player"}
      </p>

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
    <div className="relative overflow-hidden rounded-[24px] bg-[#111111] shadow-[0_12px_30px_rgba(0,0,0,0.22)]">

      <div className="absolute -right-[55px] -top-[75px] h-[230px] w-[105px] rotate-[28deg] bg-[#FFD600]" />

      <div className="relative z-10">

        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#FFD600]">
              Championship
            </p>

            <p className="mt-1 text-[17px] font-black text-white">
              GRAND FINAL
            </p>
          </div>

          <div className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-[#FFD600] text-[21px]">
            🏆
          </div>
        </div>

        <div className="flex min-h-[220px] items-center justify-between gap-2 px-4 py-7">

          <FinalPlayerBlock player={match.player1} />

          <div className="flex shrink-0 flex-col items-center">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/40">
              Final Score
            </p>

            <div className="mt-3 flex items-center gap-2">
              <FinalScoreBox score={match.score1} />

              <span className="text-[13px] font-black text-[#FFD600]">
                -
              </span>

              <FinalScoreBox score={match.score2} />
            </div>

            <div className="mt-4 text-[28px]">🏆</div>
          </div>

          <FinalPlayerBlock player={match.player2} />

        </div>

        <div className="bg-[#FFD600] py-3 text-center text-[10px] font-black uppercase tracking-[0.18em] text-[#111111]">
          Play • Compete • Win
        </div>

      </div>
    </div>
  );
}

/* =========================================================
   FINAL PLAYER
========================================================= */

function FinalPlayerBlock({
  player,
}: {
  player: Player | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">

      <div className="rounded-full border-[3px] border-[#FFD600] p-[2px]">
        <PlayerAvatar player={player} final />
      </div>

      <p className="mt-3 w-full truncate text-center text-[11px] font-black text-white">
        {player?.username || "Waiting for player"}
      </p>

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
    ? "h-[54px] w-[54px]"
    : "h-[31px] w-[31px]";

  if (!player?.profilePhoto) {
    return (
      <div
        className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#FFD600] bg-[#f1f1f1] text-[20px]`}
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
        src={player.profilePhoto}
        alt={player.username}
        className="h-full w-full object-cover"
      />
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
    <div className="flex h-[38px] min-w-[38px] items-center justify-center rounded-[9px] bg-[#FFD600] px-2 text-[18px] font-black text-[#111111] shadow">
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
    <div className="flex h-[48px] min-w-[48px] items-center justify-center rounded-[12px] bg-[#FFD600] px-2 text-[25px] font-black text-[#111111] shadow">
      {score ?? "-"}
    </div>
  );
}
