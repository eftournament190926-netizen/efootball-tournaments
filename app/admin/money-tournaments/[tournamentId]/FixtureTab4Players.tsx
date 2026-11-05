
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/* =========================================
   TYPES
========================================= */

type Player = {
  id: string;
  uid: string;
  username: string;
  avatar: string;
};

type Registration = {
  id: string;
  uid?: string;
  userId?: string;
  username?: string;
  eFootballUsername?: string;
  profilePhoto?: string;
  status?: string;
  createdAt?: {
    seconds?: number;
  };
};

type Score = {
  p1Score: number;
  p2Score: number;
};

type MatchPlayers = {
  player1Id: string;
  player2Id: string;
};

type Tournament = {
  id: string;
  maxPlayers: number;
  firstPrize?: number;
  secondPrize?: number;
  prizeCredited?: boolean;
  prizeCreditedAt?: unknown;
  scores?: Record<string, Score>;
  matchPlayers?: Record<string, MatchPlayers>;
  penaltyWinners?: Record<string, string>;
  winnerId?: string;
  runnerId?: string;
};

type Props = {
  tournament: Tournament;
  onTournamentUpdated?: (
    changes?: Partial<Tournament>
  ) => void;
};

type MatchData = {
  id: string;
  title: string;
  player1Id: string;
  player2Id: string;
};

type StatTotals = {
  goals: number;
  conceded: number;
  wins: number;
  losses: number;
  matches: number;
  tournamentPlayed: number;
  tournamentWon: number;
  tournamentRunner: number;
};

/* =========================================
   MAIN COMPONENT
========================================= */

export default function FixtureTab4Players({
  tournament,
  onTournamentUpdated,
}: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [scores, setScores] = useState<
    Record<string, Score>
  >(tournament.scores || {});

  const [matchPlayers, setMatchPlayers] = useState<
    Record<string, MatchPlayers>
  >(tournament.matchPlayers || {});

  const [penaltyWinners, setPenaltyWinners] =
    useState<Record<string, string>>(
      tournament.penaltyWinners || {}
    );

  const [activeRound, setActiveRound] = useState<
    "semi" | "final"
  >("semi");

  const [editingMatchId, setEditingMatchId] =
    useState<string | null>(null);

  const [editPlayer1, setEditPlayer1] = useState("");
  const [editPlayer2, setEditPlayer2] = useState("");
  const [editP1Score, setEditP1Score] = useState("");
  const [editP2Score, setEditP2Score] = useState("");
  const [editPenaltyWinner, setEditPenaltyWinner] =
    useState("");

  const [message, setMessage] = useState("");

  const tournamentRef = doc(
    db,
    "moneyTournaments",
    tournament.id
  );

  /* =========================================
     SYNC TOURNAMENT PROPS
  ========================================= */

  useEffect(() => {
    setScores(tournament.scores || {});
    setMatchPlayers(tournament.matchPlayers || {});
    setPenaltyWinners(tournament.penaltyWinners || {});
  }, [
    tournament.scores,
    tournament.matchPlayers,
    tournament.penaltyWinners,
  ]);

  /* =========================================
     REALTIME TOURNAMENT LISTENER
  ========================================= */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      tournamentRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setScores(
          (data.scores || {}) as Record<string, Score>
        );

        setMatchPlayers(
          (data.matchPlayers || {}) as Record<
            string,
            MatchPlayers
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
        console.error("Tournament listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [tournament.id]);

  /* =========================================
     REALTIME PLAYER REGISTRATIONS
  ========================================= */

  useEffect(() => {
    let mounted = true;

    const registrationsQuery = query(
      collection(db, "moneyTournamentRegistrations"),
      where("tournamentId", "==", tournament.id)
    );

    const unsubscribe = onSnapshot(
      registrationsQuery,
      async (snapshot) => {
        try {
          const registrations = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Registration[];

          const confirmed = registrations
            .filter(
              (item) =>
                !item.status ||
                item.status.toLowerCase() === "confirmed"
            )
            .sort(
              (a, b) =>
                (a.createdAt?.seconds || 0) -
                (b.createdAt?.seconds || 0)
            );

          const loadedPlayers: Player[] = [];
          const usedIds = new Set<string>();

          for (const registration of confirmed) {
            const playerId =
              registration.userId ||
              registration.uid ||
              registration.id;

            if (!playerId || usedIds.has(playerId)) {
              continue;
            }

            let username =
              registration.username ||
              registration.eFootballUsername ||
              "";

            let avatar = registration.profilePhoto || "";

            if (!username || !avatar) {
              try {
                const userSnap = await getDoc(
                  doc(db, "users", playerId)
                );

                if (userSnap.exists()) {
                  const profile = userSnap.data();

                  username =
                    username ||
                    profile.username ||
                    profile.eFootballUsername ||
                    profile.efootballUsername ||
                    profile.gameUsername ||
                    profile.name ||
                    "";

                  avatar =
                    avatar ||
                    profile.profilePhoto ||
                    profile.avatar ||
                    profile.photoURL ||
                    profile.profileImage ||
                    "";
                }
              } catch (error) {
                console.warn("Profile lookup failed:", error);
              }
            }

            loadedPlayers.push({
              id: playerId,
              uid: playerId,
              username: username || "Player",
              avatar,
            });

            usedIds.add(playerId);

            if (loadedPlayers.length >= 4) break;
          }

          if (mounted) {
            setPlayers(loadedPlayers);
            setLoading(false);
            setMessage("");
          }
        } catch (error) {
          console.error("Players loading error:", error);

          if (mounted) {
            setLoading(false);
            setMessage("Unable to load tournament players.");
          }
        }
      },
      (error) => {
        console.error("Registration listener error:", error);

        if (mounted) {
          setLoading(false);
          setMessage("Unable to load tournament players.");
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [tournament.id]);

  /* =========================================
     PLAYER HELPERS
  ========================================= */

  const playerMap = useMemo(() => {
    const map: Record<string, Player> = {};

    players.forEach((player) => {
      map[player.id] = player;
    });

    return map;
  }, [players]);

  function getPlayerName(id: string) {
    return playerMap[id]?.username || "Waiting";
  }

  function getSavedPlayers(
    matchId: string,
    defaultPlayer1: string,
    defaultPlayer2: string
  ): MatchPlayers {
    const saved = matchPlayers[matchId];

    return {
      player1Id: saved?.player1Id || defaultPlayer1,
      player2Id: saved?.player2Id || defaultPlayer2,
    };
  }

  function getScore(matchId: string): Score {
    return scores[matchId] || {
      p1Score: 0,
      p2Score: 0,
    };
  }

  function getMatchWinner(
    matchId: string,
    player1Id: string,
    player2Id: string
  ): string {
    if (!player1Id || !player2Id) return "";

    const score = getScore(matchId);

    if (score.p1Score > score.p2Score) {
      return player1Id;
    }

    if (score.p2Score > score.p1Score) {
      return player2Id;
    }

    const penaltyWinner = penaltyWinners[matchId] || "";

    if (
      penaltyWinner === player1Id ||
      penaltyWinner === player2Id
    ) {
      return penaltyWinner;
    }

    return "";
  }

  function getWinner(matchId: string): string {
    if (matchId === "1") {
      const match = getSavedPlayers(
        "1",
        players[0]?.id || "",
        players[1]?.id || ""
      );

      return getMatchWinner(
        "1",
        match.player1Id,
        match.player2Id
      );
    }

    if (matchId === "2") {
      const match = getSavedPlayers(
        "2",
        players[2]?.id || "",
        players[3]?.id || ""
      );

      return getMatchWinner(
        "2",
        match.player1Id,
        match.player2Id
      );
    }

    if (matchId === "3") {
      const semi1 = getSavedPlayers(
        "1",
        players[0]?.id || "",
        players[1]?.id || ""
      );

      const semi2 = getSavedPlayers(
        "2",
        players[2]?.id || "",
        players[3]?.id || ""
      );

      const winner1 = getMatchWinner(
        "1",
        semi1.player1Id,
        semi1.player2Id
      );

      const winner2 = getMatchWinner(
        "2",
        semi2.player1Id,
        semi2.player2Id
      );

      const final = getSavedPlayers(
        "3",
        winner1,
        winner2
      );

      return getMatchWinner(
        "3",
        final.player1Id,
        final.player2Id
      );
    }

    return "";
  }

  /* =========================================
     SEMI FINAL MATCHES
  ========================================= */

  const semi1 = getSavedPlayers(
    "1",
    players[0]?.id || "",
    players[1]?.id || ""
  );

  const semi2 = getSavedPlayers(
    "2",
    players[2]?.id || "",
    players[3]?.id || ""
  );

  const semi1Winner = getWinner("1");
  const semi2Winner = getWinner("2");

  /* =========================================
     GRAND FINAL
  ========================================= */

  const finalPlayers = getSavedPlayers(
    "3",
    semi1Winner,
    semi2Winner
  );

  const matches: MatchData[] = [
    {
      id: "1",
      title: "SEMI FINAL 1",
      player1Id: semi1.player1Id,
      player2Id: semi1.player2Id,
    },
    {
      id: "2",
      title: "SEMI FINAL 2",
      player1Id: semi2.player1Id,
      player2Id: semi2.player2Id,
    },
    {
      id: "3",
      title: "GRAND FINAL",
      player1Id: finalPlayers.player1Id,
      player2Id: finalPlayers.player2Id,
    },
  ];

  /* =========================================
     START EDITING
  ========================================= */

  function startEditing(match: MatchData) {
    const savedScore = scores[match.id];
    const savedPlayers = matchPlayers[match.id];

    setEditingMatchId(match.id);

    setEditPlayer1(
      savedPlayers?.player1Id || match.player1Id
    );

    setEditPlayer2(
      savedPlayers?.player2Id || match.player2Id
    );

    setEditP1Score(
      savedScore ? String(savedScore.p1Score) : ""
    );

    setEditP2Score(
      savedScore ? String(savedScore.p2Score) : ""
    );

    setEditPenaltyWinner(
      penaltyWinners[match.id] || ""
    );

    setMessage("");
  }

  /* =========================================
     CANCEL EDITING
  ========================================= */

  function cancelEditing() {
    setEditingMatchId(null);
    setEditPlayer1("");
    setEditPlayer2("");
    setEditP1Score("");
    setEditP2Score("");
    setEditPenaltyWinner("");
  }

  /* =========================================
     CALCULATE TOURNAMENT STATS
  ========================================= */

  function calculateStats(
    allScores: Record<string, Score>,
    allPlayers: Record<string, MatchPlayers>,
    allPenalties: Record<string, string>
  ): Record<string, StatTotals> {
    const totals: Record<string, StatTotals> = {};

    const zero = (): StatTotals => ({
      goals: 0,
      conceded: 0,
      wins: 0,
      losses: 0,
      matches: 0,
      tournamentPlayed: 0,
      tournamentWon: 0,
      tournamentRunner: 0,
    });

    const ensure = (id: string) => {
      totals[id] ??= zero();
      return totals[id];
    };

    for (const [id, score] of Object.entries(allScores)) {
      const pair = allPlayers[id];

      if (
        !pair?.player1Id ||
        !pair?.player2Id ||
        pair.player1Id === pair.player2Id
      ) {
        continue;
      }

      if (
        !Number.isFinite(score?.p1Score) ||
        !Number.isFinite(score?.p2Score)
      ) {
        continue;
      }

      const p1 = ensure(pair.player1Id);
      const p2 = ensure(pair.player2Id);

      p1.goals += score.p1Score;
      p1.conceded += score.p2Score;

      p2.goals += score.p2Score;
      p2.conceded += score.p1Score;

      p1.matches += 1;
      p2.matches += 1;

      if (score.p1Score > score.p2Score) {
        p1.wins += 1;
        p2.losses += 1;
      } else if (score.p2Score > score.p1Score) {
        p2.wins += 1;
        p1.losses += 1;
      } else if (allPenalties[id] === pair.player1Id) {
        p1.wins += 1;
        p2.losses += 1;
      } else if (allPenalties[id] === pair.player2Id) {
        p2.wins += 1;
        p1.losses += 1;
      }
    }

    for (const stats of Object.values(totals)) {
      stats.tournamentPlayed = stats.matches > 0 ? 1 : 0;
    }

    const finalScore = allScores["3"];
    const finalists = allPlayers["3"];

    if (
      finalScore &&
      finalists?.player1Id &&
      finalists?.player2Id &&
      finalists.player1Id !== finalists.player2Id
    ) {
      let winner = "";
      let runner = "";

      if (
        finalScore.p1Score > finalScore.p2Score ||
        (
          finalScore.p1Score === finalScore.p2Score &&
          allPenalties["3"] === finalists.player1Id
        )
      ) {
        winner = finalists.player1Id;
        runner = finalists.player2Id;
      } else if (
        finalScore.p2Score > finalScore.p1Score ||
        (
          finalScore.p1Score === finalScore.p2Score &&
          allPenalties["3"] === finalists.player2Id
        )
      ) {
        winner = finalists.player2Id;
        runner = finalists.player1Id;
      }

      if (winner && runner) {
        ensure(winner).tournamentWon += 1;
        ensure(runner).tournamentRunner += 1;
      }
    }

    return totals;
  }

  /* =========================================
     SAVE MATCH
  ========================================= */

  async function saveMatch(matchId: string) {
    if (!editPlayer1 || !editPlayer2) {
      setMessage("Please select both players.");
      return;
    }

    if (editPlayer1 === editPlayer2) {
      setMessage("Same player cannot be selected twice.");
      return;
    }

    if (
      editP1Score.trim() === "" ||
      editP2Score.trim() === ""
    ) {
      setMessage("Please enter both scores.");
      return;
    }

    const p1Score = Number(editP1Score);
    const p2Score = Number(editP2Score);

    if (
      !Number.isInteger(p1Score) ||
      p1Score < 0 ||
      !Number.isInteger(p2Score) ||
      p2Score < 0
    ) {
      setMessage("Please enter valid scores.");
      return;
    }

    if (
      p1Score === p2Score &&
      editPenaltyWinner !== editPlayer1 &&
      editPenaltyWinner !== editPlayer2
    ) {
      setMessage("Please select a valid penalty winner.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      const result = await runTransaction(
        db,
        async (transaction) => {
          const tournamentSnap =
            await transaction.get(tournamentRef);

          if (!tournamentSnap.exists()) {
            throw new Error("Tournament not found.");
          }

          const tournamentData = tournamentSnap.data();
          if (tournamentData.prizeCredited === true) {
  throw new Error(
    "Tournament prizes are already credited. Match editing is disabled."
  );
}

          const oldScores = (tournamentData.scores || {}) as
            Record<string, Score>;

          const oldMatchPlayers = (
            tournamentData.matchPlayers || {}
          ) as Record<string, MatchPlayers>;

          const oldPenaltyWinners = (
            tournamentData.penaltyWinners || {}
          ) as Record<string, string>;

          const newScores = {
            ...oldScores,
            [matchId]: {
              p1Score,
              p2Score,
            },
          };

          const newMatchPlayers = {
            ...oldMatchPlayers,
            [matchId]: {
              player1Id: editPlayer1,
              player2Id: editPlayer2,
            },
          };

          const newPenaltyWinners = {
            ...oldPenaltyWinners,
          };

          if (p1Score === p2Score) {
            newPenaltyWinners[matchId] =
              editPenaltyWinner;
          } else {
            delete newPenaltyWinners[matchId];
          }

          const oldStats = calculateStats(
            oldScores,
            oldMatchPlayers,
            oldPenaltyWinners
          );

          const newStats = calculateStats(
            newScores,
            newMatchPlayers,
            newPenaltyWinners
          );

          const affectedIds = Array.from(
            new Set([
              ...Object.keys(oldStats),
              ...Object.keys(newStats),
            ])
          );

          // All transaction reads must happen before writes.
          const userDocs = [];

          for (const userId of affectedIds) {
            const userRef = doc(db, "users", userId);
            const userSnap = await transaction.get(userRef);

            userDocs.push({
              userId,
              userRef,
              userSnap,
            });
          }

          const playedUsersMap: Record<string, boolean> = {
            ...(
              (tournamentData.playedUsersMap || {}) as
                Record<string, boolean>
            ),
          };

          for (const [userId, stats] of Object.entries(newStats)) {
            if (stats.matches > 0) {
              playedUsersMap[userId] = true;
            }
          }

          for (const userId of Object.keys(oldStats)) {
            if (!newStats[userId]?.matches) {
              delete playedUsersMap[userId];
            }
          }

          const tournamentUpdate: Record<string, unknown> = {
            scores: newScores,
            matchPlayers: newMatchPlayers,
            penaltyWinners: newPenaltyWinners,
            playedUsersMap,
            updatedAt: serverTimestamp(),
          };

          const finalScore = newScores["3"];
          const finalPair = newMatchPlayers["3"];

          if (
            finalScore &&
            finalPair?.player1Id &&
            finalPair?.player2Id
          ) {
            let winner = "";
            let runner = "";

            if (
              finalScore.p1Score > finalScore.p2Score ||
              (
                finalScore.p1Score === finalScore.p2Score &&
                newPenaltyWinners["3"] === finalPair.player1Id
              )
            ) {
              winner = finalPair.player1Id;
              runner = finalPair.player2Id;
            } else if (
              finalScore.p2Score > finalScore.p1Score ||
              (
                finalScore.p1Score === finalScore.p2Score &&
                newPenaltyWinners["3"] === finalPair.player2Id
              )
            ) {
              winner = finalPair.player2Id;
              runner = finalPair.player1Id;
            }

            tournamentUpdate.winnerId = winner || deleteField();
            tournamentUpdate.runnerId = runner || deleteField();
          }

          transaction.update(
            tournamentRef,
            tournamentUpdate
          );

          const statKeys: (keyof StatTotals)[] = [
            "goals",
            "conceded",
            "wins",
            "losses",
            "matches",
            "tournamentPlayed",
            "tournamentWon",
            "tournamentRunner",
          ];

          const zero = (): StatTotals => ({
            goals: 0,
            conceded: 0,
            wins: 0,
            losses: 0,
            matches: 0,
            tournamentPlayed: 0,
            tournamentWon: 0,
            tournamentRunner: 0,
          });

          for (const {
            userId,
            userRef,
            userSnap,
          } of userDocs) {
            const previous = oldStats[userId] || zero();
            const updated = newStats[userId] || zero();

            const existing = userSnap.exists()
              ? (
                  userSnap.data().tournamentStats || {}
                ) as Partial<StatTotals>
              : {};

            const next: StatTotals = zero();

            for (const key of statKeys) {
              next[key] = Math.max(
                0,
                Number(existing[key] || 0) +
                  updated[key] -
                  previous[key]
              );
            }

            transaction.set(
              userRef,
              {
                tournamentStats: {
                  ...existing,
                  ...next,
                },
              },
              { merge: true }
            );
          }

          return {
            newScores,
            newMatchPlayers,
            newPenaltyWinners,
            winnerId: tournamentUpdate.winnerId,
            runnerId: tournamentUpdate.runnerId,
          };
        }
      );

      setScores(result.newScores);
      setMatchPlayers(result.newMatchPlayers);
      setPenaltyWinners(result.newPenaltyWinners);

      onTournamentUpdated?.({
        scores: result.newScores,
        matchPlayers: result.newMatchPlayers,
        penaltyWinners: result.newPenaltyWinners,
      });

      cancelEditing();
      setMessage("Match score and player stats updated successfully.");
    } catch (error) {
      console.error("Failed to save match:", error);
      setMessage("Failed to save match and update player stats.");
    } finally {
      setSaving(false);
    }
  }

  /* =========================================
     SAVE FINAL RESULT
  ========================================= */

    async function saveFinalResult() {
    try {
      setSaving(true);
      setMessage("");

      const result = await runTransaction(
        db,
        async (transaction) => {
          // 1. Get latest tournament data
          const tournamentSnap =
            await transaction.get(tournamentRef);

          if (!tournamentSnap.exists()) {
            throw new Error("Tournament not found.");
          }

          const tournamentData = tournamentSnap.data();

          // 2. Prevent duplicate prize credit
          if (tournamentData.prizeCredited === true) {
            throw new Error(
              "Prize has already been credited to the winner and runner-up."
            );
          }

          // 3. Get latest final match data
          const finalScores = (
            tournamentData.scores || {}
          ) as Record<string, Score>;

          const finalPlayers = (
            tournamentData.matchPlayers || {}
          ) as Record<string, MatchPlayers>;

          const finalPenalties = (
            tournamentData.penaltyWinners || {}
          ) as Record<string, string>;

          const finalScore = finalScores["3"];
          const finalPair = finalPlayers["3"];

          if (
            !finalScore ||
            !finalPair?.player1Id ||
            !finalPair?.player2Id
          ) {
            throw new Error(
              "Please complete the Grand Final match first."
            );
          }

          if (
            finalPair.player1Id === finalPair.player2Id
          ) {
            throw new Error(
              "Both finalists must be different players."
            );
          }

          // 4. Determine winner and runner-up
          let winnerId = "";
          let runnerId = "";

          if (
            finalScore.p1Score > finalScore.p2Score
          ) {
            winnerId = finalPair.player1Id;
            runnerId = finalPair.player2Id;
          } else if (
            finalScore.p2Score > finalScore.p1Score
          ) {
            winnerId = finalPair.player2Id;
            runnerId = finalPair.player1Id;
          } else {
            const penaltyWinner = finalPenalties["3"];

            if (penaltyWinner === finalPair.player1Id) {
              winnerId = finalPair.player1Id;
              runnerId = finalPair.player2Id;
            } else if (
              penaltyWinner === finalPair.player2Id
            ) {
              winnerId = finalPair.player2Id;
              runnerId = finalPair.player1Id;
            } else {
              throw new Error(
                "Please select a valid penalty winner."
              );
            }
          }

          if (!winnerId || !runnerId) {
            throw new Error(
              "Unable to determine winner and runner-up."
            );
          }

          // 5. Get prize amounts from Firestore
          const firstPrize = Number(
            tournamentData.firstPrize ?? 0
          );

          const secondPrize = Number(
            tournamentData.secondPrize ?? 0
          );

          if (
            !Number.isFinite(firstPrize) ||
            firstPrize < 0 ||
            !Number.isFinite(secondPrize) ||
            secondPrize < 0
          ) {
            throw new Error(
              "Invalid tournament prize amounts."
            );
          }

          // 6. Read both user documents before writing
          const winnerRef = doc(
            db,
            "users",
            winnerId
          );

          const runnerRef = doc(
            db,
            "users",
            runnerId
          );

          const winnerSnap =
            await transaction.get(winnerRef);

          const runnerSnap =
            await transaction.get(runnerRef);

          if (!winnerSnap.exists()) {
            throw new Error(
              "Winner user account not found."
            );
          }

          if (!runnerSnap.exists()) {
            throw new Error(
              "Runner-up user account not found."
            );
          }

          // 7. Calculate new winnings balances
          const winnerData = winnerSnap.data();
          const runnerData = runnerSnap.data();

          const winnerBalance = Number(
            winnerData.winningsBalance ?? 0
          );

          const runnerBalance = Number(
            runnerData.winningsBalance ?? 0
          );

          if (
            !Number.isFinite(winnerBalance) ||
            !Number.isFinite(runnerBalance)
          ) {
            throw new Error(
              "Invalid user winnings balance."
            );
          }

          const newWinnerBalance =
            winnerBalance + firstPrize;

          const newRunnerBalance =
            runnerBalance + secondPrize;

          // 8. Credit winner's first prize
          transaction.set(
            winnerRef,
            {
              winningsBalance: newWinnerBalance,
            },
            { merge: true }
          );

          // 9. Credit runner-up's second prize
          transaction.set(
            runnerRef,
            {
              winningsBalance: newRunnerBalance,
            },
            { merge: true }
          );

          // 10. Save final result and mark prizes credited
          transaction.update(tournamentRef, {
            winnerId,
            runnerId,
            prizeCredited: true,
            prizeCreditedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          return {
            winnerId,
            runnerId,
            firstPrize,
            secondPrize,
            winnerBalance: newWinnerBalance,
            runnerBalance: newRunnerBalance,
          };
        }
      );

      // 11. Update parent tournament data
      onTournamentUpdated?.({
        winnerId: result.winnerId,
        runnerId: result.runnerId,
        prizeCredited: true,
      });

      setMessage(
        `Final result saved! Winner ₹${result.firstPrize} and Runner-up ₹${result.secondPrize} credited successfully.`
      );
    } catch (error) {
      console.error(
        "Final result and prize credit error:",
        error
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to save final result and credit prizes.";

      setMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  /* =========================================
     LOADING
  ========================================= */

  if (loading) {
    return (
      <div className="flex min-h-[350px] flex-col items-center justify-center rounded-2xl bg-[#111]">
        <div className="h-9 w-9 animate-spin rounded-full border-[4px] border-white/10 border-t-[#FFD600]" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
          Loading fixture...
        </p>
      </div>
    );
  }

  /* =========================================
     UI
  ========================================= */

  return (
    <div className="min-h-[600px] space-y-5 overflow-hidden rounded-2xl bg-[#0b0b0b] p-3 sm:p-4">

      {/* HEADER */}

      <div className="relative overflow-hidden rounded-[20px] bg-[#151515] p-5 text-white">
        <div className="absolute -right-10 -top-12 h-40 w-24 rotate-[28deg] bg-[#FFD600]" />

        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#FFD600]">
            TOURNEX ADMIN
          </p>

          <h2 className="mt-2 text-2xl font-black tracking-tight">
            4 PLAYER FIXTURE
          </h2>

          <p className="mt-2 max-w-[250px] text-[11px] font-medium leading-5 text-white/50">
            Manage semifinals, championship match and player results.
          </p>
        </div>
      </div>

      {/* PLAYER COUNT */}

      <div className="rounded-[16px] border border-white/10 bg-[#151515] p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
              Registered Players
            </p>

            <p className="mt-1 text-xs font-bold text-white/80">
              Tournament participants
            </p>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-[#FFD600]">
              {players.length}
            </span>

            <span className="text-sm font-bold text-white/40">
              / 4
            </span>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#FFD600] transition-all"
            style={{
              width: `${(players.length / 4) * 100}%`,
            }}
          />
        </div>

        {players.length < 4 && (
          <p className="mt-3 text-[10px] font-semibold text-white/40">
            Fixture is available. Matches update as players join.
          </p>
        )}
      </div>

      {/* ROUND TABS */}

      <div className="sticky top-0 z-30 rounded-full border border-white/10 bg-[#151515]/95 p-1.5 backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          <RoundTab
            label="SEMI FINALS"
            active={activeRound === "semi"}
            onClick={() => setActiveRound("semi")}
          />

          <RoundTab
            label="GRAND FINAL"
            active={activeRound === "final"}
            onClick={() => setActiveRound("final")}
          />
        </div>
      </div>

      {/* MESSAGE */}

      {message && (
        <div className="rounded-xl border border-[#FFD600]/30 bg-[#FFD600]/10 p-3 text-center text-[11px] font-bold text-[#FFD600]">
          {message}
        </div>
      )}

      {/* =====================================
          SEMI FINALS TAB
      ===================================== */}

      {activeRound === "semi" && (
        <div className="space-y-5">
          <SectionLabel
            title="SEMI FINALS"
            subtitle="4 Players • Knockout Stage"
          />

          <AdminMatchCard
            match={matches[0]}
            score={scores["1"]}
            penaltyWinnerId={penaltyWinners["1"]}
            players={players}
            editing={editingMatchId === "1"}
            saving={saving}
            editPlayer1={editPlayer1}
            editPlayer2={editPlayer2}
            editP1Score={editP1Score}
            editP2Score={editP2Score}
            editPenaltyWinner={editPenaltyWinner}
            onEdit={() => startEditing(matches[0])}
            onCancel={cancelEditing}
            onSave={() => saveMatch("1")}
            onPlayer1Change={setEditPlayer1}
            onPlayer2Change={setEditPlayer2}
            onP1ScoreChange={setEditP1Score}
            onP2ScoreChange={setEditP2Score}
            onPenaltyWinnerChange={setEditPenaltyWinner}
          />

          <AdminMatchCard
            match={matches[1]}
            score={scores["2"]}
            penaltyWinnerId={penaltyWinners["2"]}
            players={players}
            editing={editingMatchId === "2"}
            saving={saving}
            editPlayer1={editPlayer1}
            editPlayer2={editPlayer2}
            editP1Score={editP1Score}
            editP2Score={editP2Score}
            editPenaltyWinner={editPenaltyWinner}
            onEdit={() => startEditing(matches[1])}
            onCancel={cancelEditing}
            onSave={() => saveMatch("2")}
            onPlayer1Change={setEditPlayer1}
            onPlayer2Change={setEditPlayer2}
            onP1ScoreChange={setEditP1Score}
            onP2ScoreChange={setEditP2Score}
            onPenaltyWinnerChange={setEditPenaltyWinner}
          />

          {/* SEMI FINAL WINNERS */}

          <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[#151515]">
            <div className="border-b border-white/10 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600]">
                Qualification
              </p>

              <h3 className="mt-1 text-base font-black text-white">
                SEMI FINAL WINNERS
              </h3>
            </div>

            <div className="space-y-3 p-4">
              <WinnerRow
                label="Semi Final 1"
                winner={
                  semi1Winner
                    ? getPlayerName(semi1Winner)
                    : "Waiting"
                }
              />

              <WinnerRow
                label="Semi Final 2"
                winner={
                  semi2Winner
                    ? getPlayerName(semi2Winner)
                    : "Waiting"
                }
              />
            </div>

            <div className="px-4 pb-4">
              <button
                type="button"
                disabled={!semi1Winner || !semi2Winner}
                onClick={() => {
                  cancelEditing();
                  setActiveRound("final");
                }}
                className="w-full rounded-xl bg-[#FFD600] py-3.5 text-[11px] font-black tracking-[0.12em] text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                GO TO GRAND FINAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================
          GRAND FINAL TAB
      ===================================== */}

      {activeRound === "final" && (
        <div className="space-y-5">
          <SectionLabel
            title="GRAND FINAL"
            subtitle="Championship Match"
          />

          <div className="py-1 text-center">
            <div className="text-[48px]">🏆</div>

            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600]">
              Tournament Championship
            </p>

            <p className="mt-1 text-[10px] font-medium text-white/40">
              The final battle for the title
            </p>
          </div>

          <FinalAdminMatchCard
            match={matches[2]}
            score={scores["3"]}
            penaltyWinnerId={penaltyWinners["3"]}
            players={players}
            editing={editingMatchId === "3"}
            saving={saving}
            editPlayer1={editPlayer1}
            editPlayer2={editPlayer2}
            editP1Score={editP1Score}
            editP2Score={editP2Score}
            editPenaltyWinner={editPenaltyWinner}
            onEdit={() => startEditing(matches[2])}
            onCancel={cancelEditing}
            onSave={() => saveMatch("3")}
            onPlayer1Change={setEditPlayer1}
            onPlayer2Change={setEditPlayer2}
            onP1ScoreChange={setEditP1Score}
            onP2ScoreChange={setEditP2Score}
            onPenaltyWinnerChange={setEditPenaltyWinner}
          />

          {/* FINAL RESULT */}

          <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[#151515]">
            <div className="border-b border-white/10 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600]">
                Tournament Result
              </p>

              <h3 className="mt-1 text-base font-black text-white">
                FINAL RESULT
              </h3>
            </div>

            <div className="space-y-3 p-4">
              <ResultRow
                label="CHAMPION"
                value={
                  getWinner("3")
                    ? getPlayerName(getWinner("3"))
                    : "Not decided"
                }
                icon="🏆"
              />

              <ResultRow
                label="RUNNER-UP"
                value={
                  getWinner("3")
                    ? getPlayerName(
                        getWinner("3") === matches[2].player1Id
                          ? matches[2].player2Id
                          : matches[2].player1Id
                      )
                    : "Not decided"
                }
                icon="🥈"
              />
            </div>

            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={saveFinalResult}
                disabled={saving || !getWinner("3")}
                className="w-full rounded-xl bg-[#FFD600] py-3.5 text-[11px] font-black tracking-[0.12em] text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "SAVING..." : "SAVE FINAL RESULT"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================
   ROUND TAB
========================================= */

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
      className={`rounded-full px-3 py-3 text-[10px] font-black tracking-[0.1em] transition active:scale-[0.97] ${
        active
          ? "bg-[#FFD600] text-black shadow-[0_3px_12px_rgba(255,214,0,0.18)]"
          : "text-white/45 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

/* =========================================
   SECTION LABEL
========================================= */

function SectionLabel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="h-10 w-1.5 rounded-full bg-[#FFD600]" />

      <div>
        <h3 className="text-base font-black leading-none text-white">
          {title}
        </h3>

        <p className="mt-1.5 text-[10px] font-bold text-white/40">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

/* =========================================
   ADMIN MATCH CARD
========================================= */

function AdminMatchCard({
  match,
  score,
  penaltyWinnerId,
  players,
  editing,
  saving,
  editPlayer1,
  editPlayer2,
  editP1Score,
  editP2Score,
  editPenaltyWinner,
  onEdit,
  onCancel,
  onSave,
  onPlayer1Change,
  onPlayer2Change,
  onP1ScoreChange,
  onP2ScoreChange,
  onPenaltyWinnerChange,
}: {
  match: MatchData;
  score?: Score;
  penaltyWinnerId?: string;
  players: Player[];
  editing: boolean;
  saving: boolean;
  editPlayer1: string;
  editPlayer2: string;
  editP1Score: string;
  editP2Score: string;
  editPenaltyWinner: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onPlayer1Change: (value: string) => void;
  onPlayer2Change: (value: string) => void;
  onP1ScoreChange: (value: string) => void;
  onP2ScoreChange: (value: string) => void;
  onPenaltyWinnerChange: (value: string) => void;
}) {
  const player1Id = editing
    ? editPlayer1
    : match.player1Id;

  const player2Id = editing
    ? editPlayer2
    : match.player2Id;

  const player1 = players.find(
    (player) => player.id === player1Id
  );

  const player2 = players.find(
    (player) => player.id === player2Id
  );

  const p1 = editing
    ? editP1Score
    : score
      ? String(score.p1Score)
      : "";

  const p2 = editing
    ? editP2Score
    : score
      ? String(score.p2Score)
      : "";

  const penalty = editing
    ? editPenaltyWinner
    : penaltyWinnerId || "";

  const isDraw =
    p1.trim() !== "" &&
    p2.trim() !== "" &&
    Number(p1) === Number(p2);

  const winnerId =
    p1.trim() === "" || p2.trim() === ""
      ? ""
      : Number(p1) > Number(p2)
        ? player1Id
        : Number(p2) > Number(p1)
          ? player2Id
          : penalty;

  if (editing) {
    return (
      <div className="rounded-2xl border border-[#FFD600] bg-[#151515] p-4 shadow-[0_0_20px_rgba(255,214,0,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.08em] text-white/50">
            Match {match.id}
          </span>

          <span className="rounded-full bg-[#FFD600]/10 px-3 py-1 text-[9px] font-black text-[#FFD600]">
            EDITING
          </span>
        </div>

        <EditPlayerSelect
          label="Player 1"
          value={editPlayer1}
          players={players}
          otherPlayerId={editPlayer2}
          onChange={onPlayer1Change}
        />

        <div className="my-3">
          <input
            type="number"
            min="0"
            value={editP1Score}
            onChange={(e) =>
              onP1ScoreChange(e.target.value)
            }
            placeholder="Player 1 score"
            className="w-full rounded-xl border border-white/10 bg-[#222] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#FFD600]"
          />
        </div>

        <EditPlayerSelect
          label="Player 2"
          value={editPlayer2}
          players={players}
          otherPlayerId={editPlayer1}
          onChange={onPlayer2Change}
        />

        <div className="my-3">
          <input
            type="number"
            min="0"
            value={editP2Score}
            onChange={(e) =>
              onP2ScoreChange(e.target.value)
            }
            placeholder="Player 2 score"
            className="w-full rounded-xl border border-white/10 bg-[#222] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#FFD600]"
          />
        </div>

        {isDraw && (
          <div className="mb-3 rounded-xl border border-orange-400/20 bg-orange-400/5 p-3">
            <div className="mb-2 text-[10px] font-black uppercase text-orange-300">
              Penalty Winner
            </div>

            <select
              value={editPenaltyWinner}
              onChange={(e) =>
                onPenaltyWinnerChange(e.target.value)
              }
              className="w-full rounded-xl border border-orange-300/20 bg-[#222] px-3 py-3 text-sm font-bold text-white outline-none"
            >
              <option value="">
                Select penalty winner
              </option>

              {[
                { id: editPlayer1, player: player1 },
                { id: editPlayer2, player: player2 },
              ]
                .filter((item) => item.id && item.player)
                .map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.player!.username}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-xl border border-white/15 py-3 text-xs font-black text-white/60 disabled:opacity-40"
          >
            CANCEL
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-[#FFD600] py-3 text-xs font-black text-black disabled:opacity-40"
          >
            {saving ? "SAVING..." : "SAVE"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#151515] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.08em] text-white/40">
          Match {match.id}
        </span>

        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg bg-[#FFD600]/10 px-3 py-1.5 text-[10px] font-black text-[#FFD600]"
        >
          EDIT
        </button>
      </div>

      <PlayerScoreRow
        player={player1 || null}
        score={score?.p1Score}
        winner={Boolean(
          score &&
          player1 &&
          (
            score.p1Score > score.p2Score ||
            (
              score.p1Score === score.p2Score &&
              penaltyWinnerId === player1.id
            )
          )
        )}
      />

      <div className="my-3 border-t border-dashed border-white/10" />

      <PlayerScoreRow
        player={player2 || null}
        score={score?.p2Score}
        winner={Boolean(
          score &&
          player2 &&
          (
            score.p2Score > score.p1Score ||
            (
              score.p1Score === score.p2Score &&
              penaltyWinnerId === player2.id
            )
          )
        )}
      />

      {score &&
        score.p1Score === score.p2Score &&
        penaltyWinnerId && (
          <div className="mt-3 rounded-lg bg-orange-400/10 px-3 py-2 text-center text-[9px] font-black text-orange-300">
            PENALTY WINNER:{" "}
            {players.find(
              (player) => player.id === penaltyWinnerId
            )?.username || "Selected"}
          </div>
        )}
    </div>
  );
}

/* =========================================
   FINAL ADMIN MATCH CARD
========================================= */

function FinalAdminMatchCard(props: {
  match: MatchData;
  score?: Score;
  penaltyWinnerId?: string;
  players: Player[];
  editing: boolean;
  saving: boolean;
  editPlayer1: string;
  editPlayer2: string;
  editP1Score: string;
  editP2Score: string;
  editPenaltyWinner: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onPlayer1Change: (value: string) => void;
  onPlayer2Change: (value: string) => void;
  onP1ScoreChange: (value: string) => void;
  onP2ScoreChange: (value: string) => void;
  onPenaltyWinnerChange: (value: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-[#FFD600]/20 bg-[#151515] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#FFD600]">
            Championship
          </p>

          <h3 className="mt-1 text-base font-black text-white">
            GRAND FINAL
          </h3>
        </div>

        <div className="text-3xl">🏆</div>
      </div>

      <AdminMatchCard {...props} />
    </div>
  );
}

/* =========================================
   PLAYER SELECT
========================================= */

function EditPlayerSelect({
  label,
  value,
  players,
  otherPlayerId,
  onChange,
}: {
  label: string;
  value: string;
  players: Player[];
  otherPlayerId: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-black uppercase text-white/50">
        {label}
      </div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#222] px-3 py-3 text-sm font-bold text-white outline-none focus:border-[#FFD600]"
      >
        <option value="">Select player</option>

        {players.map((player) => (
          <option
            key={player.id}
            value={player.id}
            disabled={player.id === otherPlayerId}
          >
            {player.username}
          </option>
        ))}
      </select>
    </div>
  );
}

/* =========================================
   PLAYER SCORE ROW
========================================= */

function PlayerScoreRow({
  player,
  score,
  winner = false,
}: {
  player: Player | null;
  score?: number;
  winner?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <PlayerAvatar player={player} />

      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[12px] ${
            winner
              ? "font-black text-[#FFD600]"
              : "font-bold text-white"
          }`}
        >
          {player?.username || "Waiting..."}
        </div>

        {winner && (
          <div className="mt-0.5 text-[8px] font-black uppercase text-[#FFD600]">
            Winner
          </div>
        )}
      </div>

      <div className="min-w-[24px] text-center text-lg font-black text-white">
        {typeof score === "number" ? score : "-"}
      </div>
    </div>
  );
}

/* =========================================
   PLAYER AVATAR
========================================= */

function PlayerAvatar({
  player,
}: {
  player: Player | null;
}) {
  if (player?.avatar) {
    return (
      <img
        src={player.avatar}
        alt={player.username}
        className="h-10 w-10 shrink-0 rounded-full border-2 border-[#FFD600]/40 object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#292929] text-sm">
      👤
    </div>
  );
}

/* =========================================
   WINNER ROW
========================================= */

function WinnerRow({
  label,
  winner,
}: {
  label: string;
  winner: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 p-3">
      <span className="text-[10px] font-bold text-white/45">
        {label}
      </span>

      <span className="max-w-[60%] truncate text-right text-[11px] font-black text-white">
        {winner}
      </span>
    </div>
  );
}

/* =========================================
   RESULT ROW
========================================= */

function ResultRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFD600] text-xl">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black tracking-[0.15em] text-white/40">
          {label}
        </p>

        <p className="mt-1 truncate text-sm font-black text-white">
          {value}
        </p>
      </div>
    </div>
  );
}
