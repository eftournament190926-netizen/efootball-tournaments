"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/* =========================================================
   TYPES
========================================================= */

type Player = {
  id: string;
  username: string;
  profilePhoto?: string;
};

type SavedScore = {
  p1Score: number;
  p2Score: number;
};

type SavedMatchPlayers = {
  player1Id: string;
  player2Id: string;
};

type Tournament = {
  id: string;
  maxPlayers?: number;
  entryFee?: number;
  category?: string;

  firstPrize?: number;
  secondPrize?: number;
  thirdPrize?: number;
  fourthPrize?: number;

  prizeCredited?: boolean;

  winnerId?: string;
  runnerId?: string;
  thirdPlaceId?: string;
  fourthPlaceId?: string;

  roomCode?: string;
  roomCodeA?: string;
  roomCodeB?: string;
  semiFinalRoomCode?: string;
  finalRoomCode?: string;

  scores?: Record<string, SavedScore>;
  penaltyWinners?: Record<string, string>;
  matchPlayers?: Record<string, SavedMatchPlayers>;
};

type Registration = {
  id: string;
  userId: string;
  username?: string;
  eFootballUsername?: string;
  profilePhoto?: string;
  status?: string;
  createdAt?: { seconds?: number };
};

type Match = {
  id: number;
  player1: Player | null;
  player2: Player | null;
};

type UserTournamentStats = {
  goals: number;
  conceded: number;
  wins: number;
  losses: number;
  matches: number;
  tournamentPlayed: number;
  tournamentWon: number;
  tournamentRunner: number;
};

type FixtureTabProps = {
  tournament: Tournament;
  onTournamentUpdated?: (data: Partial<Tournament>) => void;
};

function emptyTournamentStats(): UserTournamentStats {
  return {
    goals: 0,
    conceded: 0,
    wins: 0,
    losses: 0,
    matches: 0,
    tournamentPlayed: 0,
    tournamentWon: 0,
    tournamentRunner: 0,
  };
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function FixtureTab({
  tournament,
  onTournamentUpdated,
}: FixtureTabProps) {
  const [players, setPlayers] = useState<Player[]>([]);

  const [activeRound, setActiveRound] = useState<
    "round16" | "quarter" | "semi" | "final"
  >("round16");

  const [scores, setScores] = useState<Record<string, SavedScore>>(
    tournament.scores || {},
  );

  const [matchPlayers, setMatchPlayers] = useState<
    Record<string, SavedMatchPlayers>
  >(tournament.matchPlayers || {});

  const [penaltyWinners, setPenaltyWinners] = useState<
    Record<string, string>
  >(tournament.penaltyWinners || {});

  const [editingMatchId, setEditingMatchId] =
    useState<number | null>(null);

  const [editP1Score, setEditP1Score] = useState("");
  const [editP2Score, setEditP2Score] = useState("");

  const [editPlayer1, setEditPlayer1] = useState("");
  const [editPlayer2, setEditPlayer2] = useState("");

  const [editPenaltyWinner, setEditPenaltyWinner] = useState("");

  const [savingMatch, setSavingMatch] = useState<number | null>(null);

  const [semiRoomCode, setSemiRoomCode] = useState(
    tournament.semiFinalRoomCode || "",
  );

  const [savingRoomCode, setSavingRoomCode] = useState(false);
  const [creditingPrizes, setCreditingPrizes] = useState(false);

  const [prizeCredited, setPrizeCredited] = useState(
    Boolean(tournament.prizeCredited),
  );

  const hasThirdPlaceMatch =
    Number(tournament.entryFee || 0) >= 40;

  /* =========================================================
     FIRESTORE LISTENER
  ========================================================= */

  useEffect(() => {
    loadPlayers();

    const tournamentRef = doc(
      db,
      "moneyTournaments",
      tournament.id,
    );

    const unsubscribe = onSnapshot(
      tournamentRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setScores(data.scores || {});
        setMatchPlayers(data.matchPlayers || {});
        setPenaltyWinners(data.penaltyWinners || {});
        setSemiRoomCode(data.semiFinalRoomCode || "");
        setPrizeCredited(Boolean(data.prizeCredited));
      },
      (error) => {
        console.error("Tournament listener error:", error);
      },
    );

    return () => unsubscribe();
  }, [tournament.id]);

  useEffect(() => {
    setScores(tournament.scores || {});
    setMatchPlayers(tournament.matchPlayers || {});
    setPenaltyWinners(tournament.penaltyWinners || {});
    setSemiRoomCode(tournament.semiFinalRoomCode || "");
    setPrizeCredited(Boolean(tournament.prizeCredited));
  }, [
    tournament.scores,
    tournament.matchPlayers,
    tournament.penaltyWinners,
    tournament.semiFinalRoomCode,
    tournament.prizeCredited,
  ]);

  /* =========================================================
     LOAD PLAYERS
  ========================================================= */

  async function loadPlayers() {
    try {
      const registrationsQuery = query(
        collection(db, "moneyTournamentRegistrations"),
        where("tournamentId", "==", tournament.id),
      );

      const registrationSnap = await getDocs(registrationsQuery);

      const confirmedRegistrations: Registration[] =
        registrationSnap.docs
          .map(
            (item) =>
              ({
                id: item.id,
                ...item.data(),
              }) as Registration,
          )
          .filter((item) => item.status === "confirmed")
          .sort((a, b) => {
            return (
              (a.createdAt?.seconds || 0) -
              (b.createdAt?.seconds || 0)
            );
          });

      const loadedPlayers: Player[] = [];

      for (const registration of confirmedRegistrations) {
        let username =
          registration.username ||
          registration.eFootballUsername ||
          "Player";

        let profilePhoto = registration.profilePhoto || "";

        if (!registration.username || !registration.profilePhoto) {
          try {
            const userSnap = await getDoc(
              doc(db, "users", registration.userId),
            );

            if (userSnap.exists()) {
              const userData = userSnap.data();

              username =
                userData.username ||
                userData.eFootballUsername ||
                username;

              profilePhoto =
                userData.profilePhoto || profilePhoto;
            }
          } catch {
            // Ignore missing profile
          }
        }

        loadedPlayers.push({
          id: registration.userId,
          username,
          profilePhoto,
        });
      }

      setPlayers(loadedPlayers);
    } catch (error) {
      console.error("Failed to load tournament players:", error);
    }
  }

  /* =========================================================
     ROUND OF 16
  ========================================================= */

  const round16Matches = useMemo<Match[]>(() => {
    return Array.from({ length: 8 }, (_, i) => {
      const matchId = i + 1;
      const saved = matchPlayers[String(matchId)];

      return {
        id: matchId,
        player1:
          players.find((p) => p.id === saved?.player1Id) ||
          players[i * 2] ||
          null,
        player2:
          players.find((p) => p.id === saved?.player2Id) ||
          players[i * 2 + 1] ||
          null,
      };
    });
  }, [players, matchPlayers]);

  /* =========================================================
     MATCH LOOKUP
  ========================================================= */

  function getMatchById(matchId: number): Match | null {
    if (matchId >= 1 && matchId <= 8) {
      return (
        round16Matches.find((match) => match.id === matchId) ||
        null
      );
    }

    if (matchId >= 9 && matchId <= 12) {
      const source =
        matchId === 9
          ? 1
          : matchId === 10
            ? 3
            : matchId === 11
              ? 5
              : 7;

      return {
        id: matchId,
        player1: getWinner(source),
        player2: getWinner(source + 1),
      };
    }

    if (matchId === 13) {
      return {
        id: 13,
        player1: getWinner(9),
        player2: getWinner(10),
      };
    }

    if (matchId === 14) {
      return {
        id: 14,
        player1: getWinner(11),
        player2: getWinner(12),
      };
    }

    if (matchId === 15) {
      return {
        id: 15,
        player1: getWinner(13),
        player2: getWinner(14),
      };
    }

    if (matchId === 16) {
      return {
        id: 16,
        player1: getLoser(13),
        player2: getLoser(14),
      };
    }

    return null;
  }

  /* =========================================================
     WINNER
  ========================================================= */

  function getWinner(matchId: number): Player | null {
    const match = getMatchById(matchId);

    if (!match?.player1 || !match.player2) return null;

    const score = scores[String(matchId)];
    if (!score) return null;

    if (score.p1Score > score.p2Score) return match.player1;
    if (score.p2Score > score.p1Score) return match.player2;

    const penaltyWinnerId = penaltyWinners[String(matchId)];

    if (penaltyWinnerId === match.player1.id) return match.player1;
    if (penaltyWinnerId === match.player2.id) return match.player2;

    return null;
  }

  /* =========================================================
     LOSER
  ========================================================= */

  function getLoser(matchId: number): Player | null {
    const match = getMatchById(matchId);

    if (!match?.player1 || !match.player2) return null;

    const score = scores[String(matchId)];
    if (!score) return null;

    if (score.p1Score > score.p2Score) return match.player2;
    if (score.p2Score > score.p1Score) return match.player1;

    const penaltyWinnerId = penaltyWinners[String(matchId)];

    if (penaltyWinnerId === match.player1.id) return match.player2;
    if (penaltyWinnerId === match.player2.id) return match.player1;

    return null;
  }

  /* =========================================================
     ROUND MATCHES
  ========================================================= */

  const quarterMatches = useMemo<Match[]>(() => {
    return [
      { id: 9, player1: getWinner(1), player2: getWinner(2) },
      { id: 10, player1: getWinner(3), player2: getWinner(4) },
      { id: 11, player1: getWinner(5), player2: getWinner(6) },
      { id: 12, player1: getWinner(7), player2: getWinner(8) },
    ];
  }, [scores, penaltyWinners, round16Matches]);

  const semiMatches = useMemo<Match[]>(() => {
    return [
      {
        id: 13,
        player1: getWinner(9),
        player2: getWinner(10),
      },
      {
        id: 14,
        player1: getWinner(11),
        player2: getWinner(12),
      },
    ];
  }, [scores, penaltyWinners, quarterMatches]);

  const finalMatch = useMemo<Match>(() => {
    return {
      id: 15,
      player1: getWinner(13),
      player2: getWinner(14),
    };
  }, [scores, penaltyWinners, semiMatches]);

  const thirdPlaceMatch = useMemo<Match>(() => {
    return {
      id: 16,
      player1: getLoser(13),
      player2: getLoser(14),
    };
  }, [scores, penaltyWinners, semiMatches]);

  /* =========================================================
     EDIT MATCH
  ========================================================= */

  function startEditing(match: Match) {
    if (prizeCredited) {
      alert("Prizes already credited. Match editing is locked.");
      return;
    }

    const savedScore = scores[String(match.id)];
    const savedPlayers = matchPlayers[String(match.id)];

    setEditingMatchId(match.id);

    setEditP1Score(
      savedScore ? String(savedScore.p1Score) : "",
    );

    setEditP2Score(
      savedScore ? String(savedScore.p2Score) : "",
    );

    setEditPlayer1(
      match.id === 16
        ? match.player1?.id || ""
        : savedPlayers?.player1Id || match.player1?.id || "",
    );

    setEditPlayer2(
      match.id === 16
        ? match.player2?.id || ""
        : savedPlayers?.player2Id || match.player2?.id || "",
    );

    setEditPenaltyWinner(penaltyWinners[String(match.id)] || "");
  }

  function cancelEditing() {
    setEditingMatchId(null);
    setEditP1Score("");
    setEditP2Score("");
    setEditPlayer1("");
    setEditPlayer2("");
    setEditPenaltyWinner("");
  }

  /* =========================================================
     SAVE MATCH
  ========================================================= */

  async function saveMatch(matchId: number) {
    if (prizeCredited) {
      alert("Prizes already credited. Match editing is locked.");
      return;
    }

    if (!editPlayer1 || !editPlayer2) {
      alert("Please select both players.");
      return;
    }

    if (editPlayer1 === editPlayer2) {
      alert("Same player cannot be selected twice.");
      return;
    }

    if (matchId === 16) {
      if (
        !thirdPlaceMatch.player1 ||
        !thirdPlaceMatch.player2 ||
        thirdPlaceMatch.player1.id !== editPlayer1 ||
        thirdPlaceMatch.player2.id !== editPlayer2
      ) {
        alert(
          "3rd Place Match players must be the losers of Match 13 and Match 14.",
        );
        return;
      }
    }

    const p1Score = Number(editP1Score);
    const p2Score = Number(editP2Score);

    if (
      editP1Score === "" ||
      editP2Score === "" ||
      !Number.isInteger(p1Score) ||
      p1Score < 0 ||
      !Number.isInteger(p2Score) ||
      p2Score < 0
    ) {
      alert("Please enter valid scores.");
      return;
    }

    if (p1Score === p2Score && !editPenaltyWinner) {
      alert("Draw match-il penalty winner select cheyyanam.");
      return;
    }

    if (
      p1Score === p2Score &&
      editPenaltyWinner !== editPlayer1 &&
      editPenaltyWinner !== editPlayer2
    ) {
      alert("Penalty winner must be one of the two players.");
      return;
    }

    try {
      setSavingMatch(matchId);

      const tournamentRef = doc(
        db,
        "moneyTournaments",
        tournament.id,
      );

      const result = await runTransaction(db, async (transaction) => {
        const tournamentSnap = await transaction.get(tournamentRef);

        if (!tournamentSnap.exists()) {
          throw new Error("Tournament not found.");
        }

        const tournamentData = tournamentSnap.data();

        if (tournamentData.prizeCredited === true) {
          throw new Error(
            "Prizes already credited. Match editing is locked.",
          );
        }

        const oldScores: Record<string, SavedScore> =
          tournamentData.scores || {};

        const oldMatchPlayers: Record<string, SavedMatchPlayers> =
          tournamentData.matchPlayers || {};

        const oldPenaltyWinners: Record<string, string> =
          tournamentData.penaltyWinners || {};

        const playedUsersMap: Record<string, boolean> =
          tournamentData.playedUsersMap || {};

        const newScores = {
          ...oldScores,
          [String(matchId)]: { p1Score, p2Score },
        };

        const newMatchPlayers = {
          ...oldMatchPlayers,
          [String(matchId)]: {
            player1Id: editPlayer1,
            player2Id: editPlayer2,
          },
        };

        const newPenaltyWinners = { ...oldPenaltyWinners };

        if (p1Score === p2Score) {
          newPenaltyWinners[String(matchId)] = editPenaltyWinner;
        } else {
          delete newPenaltyWinners[String(matchId)];
        }

        const newPlayedUsersMap = { ...playedUsersMap };

        let p1TournamentPlayedDelta = 0;
        let p2TournamentPlayedDelta = 0;

        if (!newPlayedUsersMap[editPlayer1]) {
          newPlayedUsersMap[editPlayer1] = true;
          p1TournamentPlayedDelta = 1;
        }

        if (!newPlayedUsersMap[editPlayer2]) {
          newPlayedUsersMap[editPlayer2] = true;
          p2TournamentPlayedDelta = 1;
        }

        let winnerId = "";
        let runnerId = "";

        if (matchId === 15) {
          if (p1Score > p2Score) {
            winnerId = editPlayer1;
            runnerId = editPlayer2;
          } else if (p2Score > p1Score) {
            winnerId = editPlayer2;
            runnerId = editPlayer1;
          } else {
            winnerId = editPenaltyWinner;
            runnerId =
              editPenaltyWinner === editPlayer1
                ? editPlayer2
                : editPlayer1;
          }
        }

        const affectedUserIds = new Set([
          editPlayer1,
          editPlayer2,
        ]);

        const userSnapshots = [];

        for (const userId of affectedUserIds) {
          const userRef = doc(db, "users", userId);
          const userSnap = await transaction.get(userRef);

          userSnapshots.push({
            userId,
            userRef,
            userSnap,
          });
        }

        const tournamentUpdateData: Record<string, any> = {
          [`scores.${matchId}`]: { p1Score, p2Score },
          [`matchPlayers.${matchId}`]: {
            player1Id: editPlayer1,
            player2Id: editPlayer2,
          },
          playedUsersMap: newPlayedUsersMap,
          updatedAt: serverTimestamp(),
        };

        if (p1Score === p2Score) {
          tournamentUpdateData[`penaltyWinners.${matchId}`] =
            editPenaltyWinner;
        } else {
          tournamentUpdateData[`penaltyWinners.${matchId}`] =
            deleteField();
        }

        if (matchId === 15) {
          tournamentUpdateData.winnerId = winnerId;
          tournamentUpdateData.runnerId = runnerId;
        }

        // If a semi-final is edited, old Match 16 result becomes invalid.
        if (matchId === 13 || matchId === 14) {
          tournamentUpdateData["scores.16"] = deleteField();
          tournamentUpdateData["matchPlayers.16"] = deleteField();
          tournamentUpdateData["penaltyWinners.16"] = deleteField();
          tournamentUpdateData.thirdPlaceId = deleteField();
          tournamentUpdateData.fourthPlaceId = deleteField();
        }

        transaction.update(tournamentRef, tournamentUpdateData);

        /* USER MATCH STATS */

        for (const user of userSnapshots) {
          const userId = user.userId;
          const isP1 = userId === editPlayer1;

          const oldMatchScore = oldScores[String(matchId)];
          const oldMatchPlayer = oldMatchPlayers[String(matchId)];

          let oldPScore = 0;
          let oldOScore = 0;
          let oldIsWin = false;
          let oldIsLoss = false;

          if (oldMatchScore && oldMatchPlayer) {
            const isOldP1 = oldMatchPlayer.player1Id === userId;
            const isOldP2 = oldMatchPlayer.player2Id === userId;

            if (isOldP1 || isOldP2) {
              oldPScore = isOldP1
                ? oldMatchScore.p1Score
                : oldMatchScore.p2Score;

              oldOScore = isOldP1
                ? oldMatchScore.p2Score
                : oldMatchScore.p1Score;

              if (oldPScore > oldOScore) {
                oldIsWin = true;
              } else if (oldOScore > oldPScore) {
                oldIsLoss = true;
              } else {
                const oldPenalty =
                  oldPenaltyWinners[String(matchId)];

                oldIsWin = oldPenalty === userId;
                oldIsLoss = Boolean(
                  oldPenalty && oldPenalty !== userId,
                );
              }
            }
          }

          const pScore = isP1 ? p1Score : p2Score;
          const oScore = isP1 ? p2Score : p1Score;

          let isWin = pScore > oScore;
          let isLoss = oScore > pScore;

          if (pScore === oScore) {
            isWin = editPenaltyWinner === userId;
            isLoss =
              editPenaltyWinner !== userId &&
              Boolean(editPenaltyWinner);
          }

          const goalDiff = pScore - oldPScore;
          const concededDiff = oScore - oldOScore;

          const winDiff =
            (isWin ? 1 : 0) - (oldIsWin ? 1 : 0);

          const lossDiff =
            (isLoss ? 1 : 0) - (oldIsLoss ? 1 : 0);

          const wasInOldMatch =
            oldMatchPlayer?.player1Id === userId ||
            oldMatchPlayer?.player2Id === userId;

          const matchDiff = wasInOldMatch ? 0 : 1;

          const playedDelta = isP1
            ? p1TournamentPlayedDelta
            : p2TournamentPlayedDelta;

          const currentData = user.userSnap.exists()
            ? user.userSnap.data()
            : {};

          const currentStats = currentData.tournamentStats || {};

          const nextStats = {
            ...emptyTournamentStats(),
            ...currentStats,

            goals:
              Number(currentStats.goals || 0) + goalDiff,

            conceded:
              Number(currentStats.conceded || 0) +
              concededDiff,

            wins:
              Number(currentStats.wins || 0) + winDiff,

            losses:
              Number(currentStats.losses || 0) + lossDiff,

            matches:
              Number(currentStats.matches || 0) + matchDiff,

            tournamentPlayed:
              Number(currentStats.tournamentPlayed || 0) +
              playedDelta,

            // Tournament winner/runner counters are not modified here.
            // Prize payout and tournament result are stored separately.
          };

          transaction.set(
            user.userRef,
            { tournamentStats: nextStats },
            { merge: true },
          );
        }

        return {
          newScores,
          newMatchPlayers,
          newPenaltyWinners,
        };
      });

      setScores(result.newScores);
      setMatchPlayers(result.newMatchPlayers);
      setPenaltyWinners(result.newPenaltyWinners);

      onTournamentUpdated?.({
        scores: result.newScores,
        matchPlayers: result.newMatchPlayers,
        penaltyWinners: result.newPenaltyWinners,
      });

      cancelEditing();

      alert(
        matchId === 16
          ? "3rd Place Match score saved successfully."
          : "Match score saved successfully.",
      );
    } catch (error) {
      console.error("Failed to save match:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to save match.",
      );
    } finally {
      setSavingMatch(null);
    }
  }

  /* =========================================================
     CREDIT PRIZES
  ========================================================= */

  async function creditPrizes() {
    if (prizeCredited) {
      alert("Prizes have already been credited.");
      return;
    }

    const finalScore = scores["15"];
    const thirdScore = scores["16"];

    if (!finalScore) {
      alert("Please complete the Grand Final first.");
      return;
    }

    if (
      hasThirdPlaceMatch &&
      !thirdScore
    ) {
      alert("Please complete the 3rd Place Match first.");
      return;
    }

    if (
      !finalMatch.player1 ||
      !finalMatch.player2
    ) {
      alert("Grand Final players are not ready.");
      return;
    }

    if (
      hasThirdPlaceMatch &&
      (!thirdPlaceMatch.player1 ||
        !thirdPlaceMatch.player2)
    ) {
      alert("3rd Place Match players are not ready.");
      return;
    }

    const finalWinner = getWinner(15);
    const finalLoser =
      finalWinner?.id === finalMatch.player1.id
        ? finalMatch.player2
        : finalMatch.player1;

    if (!finalWinner || !finalLoser) {
      alert("Grand Final winner could not be determined.");
      return;
    }

    let thirdWinner: Player | null = null;
    let fourthPlayer: Player | null = null;

    if (hasThirdPlaceMatch) {
      thirdWinner = getWinner(16);

      if (!thirdWinner) {
        alert(
          "3rd Place Match winner could not be determined. Check the score and penalty winner.",
        );
        return;
      }

      fourthPlayer =
        thirdWinner.id === thirdPlaceMatch.player1?.id
          ? thirdPlaceMatch.player2
          : thirdPlaceMatch.player1;

      if (!fourthPlayer) {
        alert("4th place player could not be determined.");
        return;
      }
    }

    const firstPrize = Number(tournament.firstPrize || 0);
    const secondPrize = Number(tournament.secondPrize || 0);
    const thirdPrize = Number(tournament.thirdPrize || 0);
    const fourthPrize = Number(tournament.fourthPrize || 0);

    if (
      !Number.isFinite(firstPrize) ||
      !Number.isFinite(secondPrize) ||
      firstPrize < 0 ||
      secondPrize < 0
    ) {
      alert("Please check the 1st and 2nd prize amounts.");
      return;
    }

    if (
      hasThirdPlaceMatch &&
      (
        !Number.isFinite(thirdPrize) ||
        !Number.isFinite(fourthPrize) ||
        thirdPrize < 0 ||
        fourthPrize < 0
      )
    ) {
      alert("Please check the 3rd and 4th prize amounts.");
      return;
    }

    const confirmed = window.confirm(
      `Confirm prize credit?\n\n` +
        `1st: ${finalWinner.username} - ₹${firstPrize}\n` +
        `2nd: ${finalLoser.username} - ₹${secondPrize}\n` +
        (hasThirdPlaceMatch
          ? `3rd: ${thirdWinner?.username} - ₹${thirdPrize}\n` +
            `4th: ${fourthPlayer?.username} - ₹${fourthPrize}\n`
          : "") +
        `\nThis action can only be completed once.`,
    );

    if (!confirmed) return;

    try {
      setCreditingPrizes(true);

      const tournamentRef = doc(
        db,
        "moneyTournaments",
        tournament.id,
      );

      await runTransaction(db, async (transaction) => {
        const tournamentSnap = await transaction.get(
          tournamentRef,
        );

        if (!tournamentSnap.exists()) {
          throw new Error("Tournament not found.");
        }

        const tournamentData = tournamentSnap.data();

        if (tournamentData.prizeCredited === true) {
          throw new Error(
            "Prizes have already been credited for this tournament.",
          );
        }

        const storedScores = tournamentData.scores || {};
        const storedPlayers = tournamentData.matchPlayers || {};
        const storedPenalties = tournamentData.penaltyWinners || {};

        const storedFinalScore = storedScores["15"];
        const storedFinalPlayers = storedPlayers["15"];

        if (!storedFinalScore || !storedFinalPlayers) {
          throw new Error("Grand Final result is missing.");
        }

        // Re-check final result using Firestore's latest data.
        const finalP1 = storedFinalPlayers.player1Id;
        const finalP2 = storedFinalPlayers.player2Id;

        let verifiedWinner = "";
        let verifiedRunner = "";

        if (
          storedFinalScore.p1Score >
          storedFinalScore.p2Score
        ) {
          verifiedWinner = finalP1;
          verifiedRunner = finalP2;
        } else if (
          storedFinalScore.p2Score >
          storedFinalScore.p1Score
        ) {
          verifiedWinner = finalP2;
          verifiedRunner = finalP1;
        } else {
          const penaltyWinner = storedPenalties["15"];

          if (
            penaltyWinner !== finalP1 &&
            penaltyWinner !== finalP2
          ) {
            throw new Error(
              "Grand Final penalty winner is missing.",
            );
          }

          verifiedWinner = penaltyWinner;
          verifiedRunner =
            penaltyWinner === finalP1 ? finalP2 : finalP1;
        }

        if (
          verifiedWinner !== finalWinner.id ||
          verifiedRunner !== finalLoser.id
        ) {
          throw new Error(
            "Grand Final result changed. Refresh and try again.",
          );
        }

        let verifiedThird = "";
        let verifiedFourth = "";

        if (hasThirdPlaceMatch) {
          const semi1Players = storedPlayers["13"];
          const semi2Players = storedPlayers["14"];

          const semi1Score = storedScores["13"];
          const semi2Score = storedScores["14"];

          const semi1Penalty = storedPenalties["13"];
          const semi2Penalty = storedPenalties["14"];

          if (
            !semi1Players ||
            !semi2Players ||
            !semi1Score ||
            !semi2Score
          ) {
            throw new Error(
              "Both semi-final results are required.",
            );
          }

          function storedLoser(
            matchPlayerData: SavedMatchPlayers,
            score: SavedScore,
            penaltyWinnerId?: string,
          ) {
            if (score.p1Score > score.p2Score) {
              return matchPlayerData.player2Id;
            }

            if (score.p2Score > score.p1Score) {
              return matchPlayerData.player1Id;
            }

            if (penaltyWinnerId === matchPlayerData.player1Id) {
              return matchPlayerData.player2Id;
            }

            if (penaltyWinnerId === matchPlayerData.player2Id) {
              return matchPlayerData.player1Id;
            }

            return "";
          }

          const expectedThirdPlayer1 = storedLoser(
            semi1Players,
            semi1Score,
            semi1Penalty,
          );

          const expectedThirdPlayer2 = storedLoser(
            semi2Players,
            semi2Score,
            semi2Penalty,
          );

          const storedThirdPlayers = storedPlayers["16"];
          const storedThirdScore = storedScores["16"];

          if (!storedThirdPlayers || !storedThirdScore) {
            throw new Error(
              "3rd Place Match result is missing.",
            );
          }

          if (
            storedThirdPlayers.player1Id !== expectedThirdPlayer1 ||
            storedThirdPlayers.player2Id !== expectedThirdPlayer2
          ) {
            throw new Error(
              "3rd Place Match players do not match the semi-final losers.",
            );
          }

          if (
            storedThirdPlayers.player1Id !== thirdPlaceMatch.player1?.id ||
            storedThirdPlayers.player2Id !== thirdPlaceMatch.player2?.id
          ) {
            throw new Error(
              "3rd Place Match players changed. Refresh and try again.",
            );
          }

          if (
            storedThirdScore.p1Score >
            storedThirdScore.p2Score
          ) {
            verifiedThird = storedThirdPlayers.player1Id;
            verifiedFourth = storedThirdPlayers.player2Id;
          } else if (
            storedThirdScore.p2Score >
            storedThirdScore.p1Score
          ) {
            verifiedThird = storedThirdPlayers.player2Id;
            verifiedFourth = storedThirdPlayers.player1Id;
          } else {
            const penaltyWinner = storedPenalties["16"];

            if (
              penaltyWinner !== storedThirdPlayers.player1Id &&
              penaltyWinner !== storedThirdPlayers.player2Id
            ) {
              throw new Error(
                "3rd Place Match penalty winner is missing.",
              );
            }

            verifiedThird = penaltyWinner;
            verifiedFourth =
              penaltyWinner === storedThirdPlayers.player1Id
                ? storedThirdPlayers.player2Id
                : storedThirdPlayers.player1Id;
          }

          if (
            verifiedThird !== thirdWinner?.id ||
            verifiedFourth !== fourthPlayer?.id
          ) {
            throw new Error(
              "3rd Place result changed. Refresh and try again.",
            );
          }
        }

        // Read all user documents before writing anything.
        const payouts = [
          { userId: verifiedWinner, amount: firstPrize },
          { userId: verifiedRunner, amount: secondPrize },
        ];

        if (hasThirdPlaceMatch) {
          payouts.push(
            { userId: verifiedThird, amount: thirdPrize },
            { userId: verifiedFourth, amount: fourthPrize },
          );
        }

        const userRefs = payouts.map((payout) => ({
          ...payout,
          ref: doc(db, "users", payout.userId),
        }));

        const userSnapshots = [];

        for (const payout of userRefs) {
          const userSnap = await transaction.get(payout.ref);

          if (!userSnap.exists()) {
            throw new Error(
              `User account not found: ${payout.userId}`,
            );
          }

          userSnapshots.push({
            ...payout,
            userSnap,
          });
        }

        // Credit all prize balances.
        for (const payout of userSnapshots) {
          const userData = payout.userSnap.data();

          const currentBalance = Number(
            userData.winningsBalance || 0,
          );

          if (!Number.isFinite(currentBalance)) {
            throw new Error(
              `Invalid winnings balance for ${payout.userId}`,
            );
          }

          transaction.update(payout.ref, {
            winningsBalance: currentBalance + payout.amount,
          });
        }

        // Lock payout and save official tournament placements.
        transaction.update(tournamentRef, {
          prizeCredited: true,
          prizeCreditedAt: serverTimestamp(),

          winnerId: verifiedWinner,
          runnerId: verifiedRunner,

          ...(hasThirdPlaceMatch
            ? {
                thirdPlaceId: verifiedThird,
                fourthPlaceId: verifiedFourth,
              }
            : {}),

          updatedAt: serverTimestamp(),
        });
      });

      setPrizeCredited(true);

      onTournamentUpdated?.({
        prizeCredited: true,
        winnerId: finalWinner.id,
        runnerId: finalLoser.id,
        ...(hasThirdPlaceMatch
          ? {
              thirdPlaceId: thirdWinner?.id,
              fourthPlaceId: fourthPlayer?.id,
            }
          : {}),
      });

      alert("All tournament prizes credited successfully!");
    } catch (error) {
      console.error("Prize credit failed:", error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to credit prizes.",
      );
    } finally {
      setCreditingPrizes(false);
    }
  }

  /* =========================================================
     SEMI FINAL ROOM CODE
  ========================================================= */

  async function saveSemiFinalRoomCode() {
    try {
      setSavingRoomCode(true);

      await updateDoc(
        doc(db, "moneyTournaments", tournament.id),
        {
          semiFinalRoomCode: semiRoomCode.trim(),
          updatedAt: serverTimestamp(),
        },
      );

      onTournamentUpdated?.({
        semiFinalRoomCode: semiRoomCode.trim(),
      });
    } catch (error) {
      console.error(error);
      alert("Failed to save room code.");
    } finally {
      setSavingRoomCode(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  const allPlayersForEdit = players;

  return (
    <div className="w-full">
      <div className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-white">
        <div className="flex overflow-x-auto">
          <RoundTab
            active={activeRound === "round16"}
            onClick={() => setActiveRound("round16")}
          >
            Round of 16
          </RoundTab>

          <RoundTab
            active={activeRound === "quarter"}
            onClick={() => setActiveRound("quarter")}
          >
            Quarter-final
          </RoundTab>

          <RoundTab
            active={activeRound === "semi"}
            onClick={() => setActiveRound("semi")}
          >
            Semi-final
          </RoundTab>

          <RoundTab
            active={activeRound === "final"}
            onClick={() => setActiveRound("final")}
          >
            Final
          </RoundTab>
        </div>
      </div>

      {/* ROUND OF 16 */}

      {activeRound === "round16" && (
        <div className="overflow-x-auto bg-[#f3f4f6] p-4">
          <div className="flex min-w-[760px] gap-8">
            <div className="w-[340px] shrink-0">
              <SectionTitle title="Round of 16" />

              <div className="space-y-4">
                {round16Matches.map((match) => (
                  <AdminMatchCard
                    key={match.id}
                    match={match}
                    score={scores[String(match.id)]}
                    penaltyWinnerId={penaltyWinners[String(match.id)]}
                    editing={editingMatchId === match.id}
                    saving={savingMatch === match.id}
                    locked={prizeCredited}
                    players={allPlayersForEdit}
                    editPlayer1={editPlayer1}
                    editPlayer2={editPlayer2}
                    editP1Score={editP1Score}
                    editP2Score={editP2Score}
                    editPenaltyWinner={editPenaltyWinner}
                    onEdit={() => startEditing(match)}
                    onCancel={cancelEditing}
                    onSave={() => saveMatch(match.id)}
                    onPlayer1Change={setEditPlayer1}
                    onPlayer2Change={setEditPlayer2}
                    onP1ScoreChange={setEditP1Score}
                    onP2ScoreChange={setEditP2Score}
                    onPenaltyWinnerChange={setEditPenaltyWinner}
                  />
                ))}
              </div>
            </div>

            <div className="w-[300px] shrink-0">
              <SectionTitle title="Quarter-final Preview" />

              <div className="space-y-8 pt-5">
                {quarterMatches.map((match) => (
                  <PreviewMatchCard
                    key={match.id}
                    match={match}
                    score={scores[String(match.id)]}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUARTER FINAL */}

      {activeRound === "quarter" && (
        <div className="overflow-x-auto bg-[#f3f4f6] p-4">
          <div className="flex min-w-[700px] gap-10">
            <div className="w-[340px] shrink-0">
              <SectionTitle title="Quarter-final" />

              <div className="space-y-7 pt-5">
                {quarterMatches.map((match) => (
                  <AdminMatchCard
                    key={match.id}
                    match={match}
                    score={scores[String(match.id)]}
                    penaltyWinnerId={penaltyWinners[String(match.id)]}
                    editing={editingMatchId === match.id}
                    saving={savingMatch === match.id}
                    locked={prizeCredited}
                    players={allPlayersForEdit}
                    editPlayer1={editPlayer1}
                    editPlayer2={editPlayer2}
                    editP1Score={editP1Score}
                    editP2Score={editP2Score}
                    editPenaltyWinner={editPenaltyWinner}
                    onEdit={() => startEditing(match)}
                    onCancel={cancelEditing}
                    onSave={() => saveMatch(match.id)}
                    onPlayer1Change={setEditPlayer1}
                    onPlayer2Change={setEditPlayer2}
                    onP1ScoreChange={setEditP1Score}
                    onP2ScoreChange={setEditP2Score}
                    onPenaltyWinnerChange={setEditPenaltyWinner}
                  />
                ))}
              </div>
            </div>

            <div className="w-[300px] shrink-0">
              <SectionTitle title="Semi-final Preview" />

              <div className="space-y-10 pt-10">
                {semiMatches.map((match) => (
                  <PreviewMatchCard
                    key={match.id}
                    match={match}
                    score={scores[String(match.id)]}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEMI FINAL */}

      {activeRound === "semi" && (
        <div className="bg-[#f3f4f6] p-4">
          <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#777]">
              Semi Final Room Code
            </div>

            <div className="flex gap-2">
              <input
                value={semiRoomCode}
                onChange={(e) => setSemiRoomCode(e.target.value)}
                placeholder="Enter room code"
                className="min-w-0 flex-1 rounded-xl border border-[#d8d8d8] bg-[#fafafa] px-3 py-3 text-sm font-bold outline-none focus:border-[#18a957]"
              />

              <button
                type="button"
                onClick={saveSemiFinalRoomCode}
                disabled={savingRoomCode}
                className="rounded-xl bg-[#18a957] px-4 py-3 text-xs font-black text-white disabled:opacity-60"
              >
                {savingRoomCode ? "..." : "SAVE"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {semiMatches.map((match) => (
              <LargeAdminMatchCard
                key={match.id}
                match={match}
                score={scores[String(match.id)]}
                penaltyWinnerId={penaltyWinners[String(match.id)]}
                editing={editingMatchId === match.id}
                saving={savingMatch === match.id}
                locked={prizeCredited}
                players={allPlayersForEdit}
                editPlayer1={editPlayer1}
                editPlayer2={editPlayer2}
                editP1Score={editP1Score}
                editP2Score={editP2Score}
                editPenaltyWinner={editPenaltyWinner}
                onEdit={() => startEditing(match)}
                onCancel={cancelEditing}
                onSave={() => saveMatch(match.id)}
                onPlayer1Change={setEditPlayer1}
                onPlayer2Change={setEditPlayer2}
                onP1ScoreChange={setEditP1Score}
                onP2ScoreChange={setEditP2Score}
                onPenaltyWinnerChange={setEditPenaltyWinner}
              />
            ))}
          </div>
        </div>
      )}

      {/* FINAL AND THIRD PLACE */}

      {activeRound === "final" && (
        <div className="space-y-8 bg-[#f3f4f6] p-4">
          {prizeCredited && (
            <div className="rounded-2xl border border-[#a7e5bd] bg-[#e9f8ef] p-4 text-center">
              <div className="text-sm font-black text-[#168747]">
                PRIZES SUCCESSFULLY CREDITED
              </div>
              <div className="mt-1 text-[10px] font-bold text-[#38865a]">
                All prize balances have been updated. Match editing is locked.
              </div>
            </div>
          )}

          {/* GRAND FINAL */}

          <div>
            <SectionTitle title="Grand Final" />

            <div className="mt-5">
              <FinalAdminMatchCard
                match={finalMatch}
                score={scores["15"]}
                penaltyWinnerId={penaltyWinners["15"]}
                editing={editingMatchId === 15}
                saving={savingMatch === 15}
                locked={prizeCredited}
                players={allPlayersForEdit}
                editPlayer1={editPlayer1}
                editPlayer2={editPlayer2}
                editP1Score={editP1Score}
                editP2Score={editP2Score}
                editPenaltyWinner={editPenaltyWinner}
                onEdit={() => startEditing(finalMatch)}
                onCancel={cancelEditing}
                onSave={() => saveMatch(15)}
                onPlayer1Change={setEditPlayer1}
                onPlayer2Change={setEditPlayer2}
                onP1ScoreChange={setEditP1Score}
                onP2ScoreChange={setEditP2Score}
                onPenaltyWinnerChange={setEditPenaltyWinner}
              />
            </div>
          </div>

          {/* THIRD PLACE */}

          {hasThirdPlaceMatch && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle title="3rd Place Match" />

                <span className="rounded-full bg-[#fff1cc] px-3 py-1 text-[9px] font-black text-[#9a6700]">
                  MATCH 16
                </span>
              </div>

              <ThirdPlaceAdminMatchCard
                match={thirdPlaceMatch}
                score={scores["16"]}
                penaltyWinnerId={penaltyWinners["16"]}
                editing={editingMatchId === 16}
                saving={savingMatch === 16}
                locked={prizeCredited}
                players={allPlayersForEdit}
                editPlayer1={editPlayer1}
                editPlayer2={editPlayer2}
                editP1Score={editP1Score}
                editP2Score={editP2Score}
                editPenaltyWinner={editPenaltyWinner}
                onEdit={() => startEditing(thirdPlaceMatch)}
                onCancel={cancelEditing}
                onSave={() => saveMatch(16)}
                onPlayer1Change={setEditPlayer1}
                onPlayer2Change={setEditPlayer2}
                onP1ScoreChange={setEditP1Score}
                onP2ScoreChange={setEditP2Score}
                onPenaltyWinnerChange={setEditPenaltyWinner}
              />
            </div>
          )}

          {/* PRIZE PREVIEW */}

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 text-xs font-black uppercase text-[#555]">
              Prize Distribution
            </div>

            <div className="space-y-2 text-sm font-bold text-[#333]">
              <PrizeRow label="1st Place" amount={tournament.firstPrize} />
              <PrizeRow label="2nd Place" amount={tournament.secondPrize} />

              {hasThirdPlaceMatch && (
                <>
                  <PrizeRow
                    label="3rd Place"
                    amount={tournament.thirdPrize}
                  />
                  <PrizeRow
                    label="4th Place"
                    amount={tournament.fourthPrize}
                  />
                </>
              )}
            </div>
          </div>

          {/* CREDIT BUTTON */}

          <button
            type="button"
            onClick={creditPrizes}
            disabled={prizeCredited || creditingPrizes}
            className={`w-full rounded-2xl py-4 text-sm font-black text-white shadow-md ${
              prizeCredited
                ? "cursor-not-allowed bg-[#888]"
                : "bg-[#18a957] hover:bg-[#138c47]"
            }`}
          >
            {prizeCredited
              ? "PRIZES ALREADY CREDITED"
              : creditingPrizes
                ? "CREDITING PRIZES..."
                : "CREDIT PRIZES"}
          </button>

          {!prizeCredited && (
            <p className="text-center text-[10px] font-bold text-[#888]">
              Make sure all required match results and prize amounts are correct before crediting.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   ROUND TAB
========================================================= */

function RoundTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap px-4 py-3 text-[11px] font-black ${
        active
          ? "border-b-[3px] border-[#18a957] text-[#18a957]"
          : "text-[#999]"
      }`}
    >
      {children}
    </button>
  );
}

/* =========================================================
   SECTION TITLE
========================================================= */

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3 text-[13px] font-black text-[#222]">
      {title}
    </div>
  );
}

/* =========================================================
   PRIZE ROW
========================================================= */

function PrizeRow({
  label,
  amount,
}: {
  label: string;
  amount?: number;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#eee] py-2 last:border-0">
      <span>{label}</span>
      <span className="text-[#18a957]">
        ₹{Number(amount || 0)}
      </span>
    </div>
  );
}

/* =========================================================
   ADMIN MATCH CARD
========================================================= */

function AdminMatchCard(props: any) {
  const {
    match,
    score,
    penaltyWinnerId,
    editing,
    saving,
    locked,
    players,
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
  } = props;

  if (editing) {
    return (
      <div className="rounded-2xl border border-[#18a957] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.08em] text-[#777]">
            Match {match.id}
          </span>

          <span className="rounded-full bg-[#e9f8ef] px-2 py-1 text-[9px] font-black text-[#18a957]">
            EDITING
          </span>
        </div>

        <EditPlayerSelect
          label="Player 1"
          value={editPlayer1}
          players={players}
          onChange={onPlayer1Change}
        />

        <div className="my-3">
          <input
            type="number"
            min="0"
            value={editP1Score}
            onChange={(e) => onP1ScoreChange(e.target.value)}
            placeholder="Player 1 score"
            className="w-full rounded-xl border border-[#ddd] px-3 py-3 text-sm font-bold outline-none focus:border-[#18a957]"
          />
        </div>

        <EditPlayerSelect
          label="Player 2"
          value={editPlayer2}
          players={players}
          onChange={onPlayer2Change}
        />

        <div className="my-3">
          <input
            type="number"
            min="0"
            value={editP2Score}
            onChange={(e) => onP2ScoreChange(e.target.value)}
            placeholder="Player 2 score"
            className="w-full rounded-xl border border-[#ddd] px-3 py-3 text-sm font-bold outline-none focus:border-[#18a957]"
          />
        </div>

        {editP1Score !== "" &&
          editP2Score !== "" &&
          Number(editP1Score) === Number(editP2Score) && (
            <PenaltyWinnerSelect
              players={players}
              player1Id={editPlayer1}
              player2Id={editPlayer2}
              value={editPenaltyWinner}
              onChange={onPenaltyWinnerChange}
            />
          )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[#ddd] py-3 text-xs font-black text-[#666]"
          >
            CANCEL
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-[#18a957] py-3 text-xs font-black text-white disabled:opacity-60"
          >
            {saving ? "SAVING..." : "SAVE"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.08em] text-[#999]">
          Match {match.id}
        </span>

        <button
          type="button"
          onClick={onEdit}
          disabled={locked}
          className="rounded-lg bg-[#eef9f2] px-3 py-1.5 text-[10px] font-black text-[#18a957] disabled:opacity-40"
        >
          EDIT
        </button>
      </div>

      <PlayerScoreRow
        player={match.player1}
        score={score?.p1Score}
        winner={isMatchWinner(
          match.player1,
          match.player2,
          score,
          penaltyWinnerId,
        )}
      />

      <div className="my-2 border-t border-dashed border-[#e5e5e5]" />

      <PlayerScoreRow
        player={match.player2}
        score={score?.p2Score}
        winner={isMatchWinner(
          match.player2,
          match.player1,
          score
            ? {
                p1Score: score.p2Score,
                p2Score: score.p1Score,
              }
            : undefined,
          penaltyWinnerId,
        )}
      />

      {score &&
        score.p1Score === score.p2Score &&
        penaltyWinnerId && (
          <div className="mt-3 rounded-lg bg-[#fff7e6] px-3 py-2 text-center text-[9px] font-black text-[#a06a00]">
            PENALTY WINNER
          </div>
        )}
    </div>
  );
}

/* =========================================================
   LARGE ADMIN MATCH CARD
========================================================= */

function LargeAdminMatchCard(props: any) {
  const { match, score, editing, locked, onEdit } = props;

  if (editing) {
    return <AdminMatchCard {...props} />;
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#243b53] via-[#52677c] to-[#1d2936] p-5 text-white shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/60">
            Semi Final
          </div>

          <div className="mt-1 text-sm font-black">
            Match {match.id}
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          disabled={locked}
          className="rounded-lg bg-white px-3 py-2 text-[10px] font-black text-[#26384b] disabled:opacity-40"
        >
          EDIT
        </button>
      </div>

      <div className="space-y-3">
        <LargePlayerRow
          player={match.player1}
          score={score?.p1Score}
          winner={isMatchWinner(
            match.player1,
            match.player2,
            score,
            props.penaltyWinnerId,
          )}
        />

        <div className="h-px bg-white/15" />

        <LargePlayerRow
          player={match.player2}
          score={score?.p2Score}
          winner={isMatchWinner(
            match.player2,
            match.player1,
            score
              ? {
                  p1Score: score.p2Score,
                  p2Score: score.p1Score,
                }
              : undefined,
            props.penaltyWinnerId,
          )}
        />
      </div>
    </div>
  );
}

/* =========================================================
   GRAND FINAL CARD
========================================================= */

function FinalAdminMatchCard(props: any) {
  const {
    match,
    score,
    editing,
    locked,
    onEdit,
  } = props;

  if (editing) {
    return <AdminMatchCard {...props} />;
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-lg">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#999]">
            Grand Final
          </div>

          <div className="mt-1 text-base font-black text-[#222]">
            Match 15
          </div>
        </div>

        <div className="text-2xl">🏆</div>
      </div>

      <PlayerScoreRow
        player={match.player1}
        score={score?.p1Score}
        winner={isMatchWinner(
          match.player1,
          match.player2,
          score,
          props.penaltyWinnerId,
        )}
      />

      <div className="my-4 border-t border-dashed border-[#ddd]" />

      <PlayerScoreRow
        player={match.player2}
        score={score?.p2Score}
        winner={isMatchWinner(
          match.player2,
          match.player1,
          score
            ? {
                p1Score: score.p2Score,
                p2Score: score.p1Score,
              }
            : undefined,
          props.penaltyWinnerId,
        )}
      />

      <button
        type="button"
        onClick={onEdit}
        disabled={locked}
        className="mt-5 w-full rounded-xl bg-[#18a957] py-3 text-xs font-black text-white disabled:opacity-40"
      >
        EDIT FINAL
      </button>
    </div>
  );
}

/* =========================================================
   THIRD PLACE MATCH CARD
========================================================= */

function ThirdPlaceAdminMatchCard(props: any) {
  const {
    match,
    score,
    penaltyWinnerId,
    editing,
    locked,
    onEdit,
  } = props;

  if (editing) {
    return <AdminMatchCard {...props} />;
  }

  const playersReady = Boolean(match.player1 && match.player2);

  return (
    <div className="overflow-hidden rounded-3xl border border-[#e7d39b] bg-white shadow-lg">
      <div className="bg-gradient-to-r from-[#8c681d] to-[#c49a3a] px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/70">
              3rd Place Match
            </div>

            <div className="mt-1 text-base font-black">
              Match 16
            </div>
          </div>

          <div className="text-2xl">🥉</div>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <div className="rounded-xl bg-[#fff9e9] px-3 py-2 text-center text-[9px] font-black uppercase text-[#946b13]">
          Semi-final 1 & 2 losers
        </div>

        <PlayerScoreRow
          player={match.player1}
          score={score?.p1Score}
          winner={isMatchWinner(
            match.player1,
            match.player2,
            score,
            penaltyWinnerId,
          )}
        />

        <div className="border-t border-dashed border-[#ddd]" />

        <PlayerScoreRow
          player={match.player2}
          score={score?.p2Score}
          winner={isMatchWinner(
            match.player2,
            match.player1,
            score
              ? {
                  p1Score: score.p2Score,
                  p2Score: score.p1Score,
                }
              : undefined,
            penaltyWinnerId,
          )}
        />

        {!playersReady && (
          <div className="rounded-xl bg-[#f5f5f5] p-3 text-center text-[10px] font-bold text-[#888]">
            Waiting for both semi-final results...
          </div>
        )}

        <button
          type="button"
          onClick={onEdit}
          disabled={!playersReady || locked}
          className="w-full rounded-xl bg-[#b58a2c] py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          EDIT 3RD PLACE MATCH
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   PLAYER SELECT
========================================================= */

function EditPlayerSelect({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string;
  players: Player[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-black uppercase text-[#888]">
        {label}
      </div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#ddd] bg-white px-3 py-3 text-sm font-bold outline-none focus:border-[#18a957]"
      >
        <option value="">Select player</option>

        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.username}
          </option>
        ))}
      </select>
    </div>
  );
}

/* =========================================================
   PENALTY WINNER SELECT
========================================================= */

function PenaltyWinnerSelect({
  players,
  player1Id,
  player2Id,
  value,
  onChange,
}: {
  players: Player[];
  player1Id: string;
  player2Id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-3 rounded-xl bg-[#fff7e6] p-3">
      <div className="mb-2 text-[10px] font-black uppercase text-[#a06a00]">
        Penalty Winner
      </div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#e2d2a8] bg-white px-3 py-3 text-sm font-bold outline-none"
      >
        <option value="">Select penalty winner</option>

        {[player1Id, player2Id]
          .map((id) => players.find((player) => player.id === id))
          .filter((player): player is Player => Boolean(player))
          .map((player) => (
            <option key={player.id} value={player.id}>
              {player.username}
            </option>
          ))}
      </select>
    </div>
  );
}

/* =========================================================
   PREVIEW CARD
========================================================= */

function PreviewMatchCard({
  match,
  score,
}: {
  match: Match;
  score?: SavedScore;
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="mb-2 text-[9px] font-black uppercase text-[#aaa]">
        Match {match.id}
      </div>

      <PlayerScoreRow player={match.player1} score={score?.p1Score} />

      <div className="my-2 border-t border-[#eee]" />

      <PlayerScoreRow player={match.player2} score={score?.p2Score} />
    </div>
  );
}

/* =========================================================
   MATCH WINNER HELPER
========================================================= */

function isMatchWinner(
  player: Player | null,
  opponent: Player | null,
  score?: SavedScore,
  penaltyWinnerId?: string,
): boolean {
  if (!player || !opponent || !score) return false;

  if (score.p1Score > score.p2Score) return true;
  if (score.p2Score > score.p1Score) return false;

  return penaltyWinnerId === player.id;
}

/* =========================================================
   PLAYER ROW
========================================================= */

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
              ? "font-black text-[#18a957]"
              : "font-bold text-[#333]"
          }`}
        >
          {player?.username || "Waiting..."}
        </div>

        {winner && (
          <div className="mt-0.5 text-[8px] font-black uppercase text-[#18a957]">
            Winner
          </div>
        )}
      </div>

      <div className="min-w-[24px] text-center text-lg font-black text-[#222]">
        {typeof score === "number" ? score : "-"}
      </div>
    </div>
  );
}

/* =========================================================
   LARGE PLAYER ROW
========================================================= */

function LargePlayerRow({
  player,
  score,
  winner = false,
}: {
  player: Player | null;
  score?: number;
  winner?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${
        winner ? "bg-white/15" : "bg-black/10"
      }`}
    >
      <PlayerAvatar player={player} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black">
          {player?.username || "Waiting..."}
        </div>

        {winner && (
          <div className="mt-1 text-[8px] font-black uppercase text-[#8ff0b4]">
            Winner
          </div>
        )}
      </div>

      <div className="text-2xl font-black">
        {typeof score === "number" ? score : "-"}
      </div>
    </div>
  );
}

/* =========================================================
   AVATAR
========================================================= */

function PlayerAvatar({
  player,
}: {
  player: Player | null;
}) {
  if (player?.profilePhoto) {
    return (
      <img
        src={player.profilePhoto}
        alt=""
        className="h-10 w-10 rounded-full border-2 border-white object-cover shadow-sm"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e9ecef] text-sm">
      👤
    </div>
  );
}