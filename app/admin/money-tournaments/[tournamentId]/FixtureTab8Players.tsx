"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteField,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  runTransaction,
  serverTimestamp,
  where,
  onSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type Player = {
  id: string;
  username: string;
  profilePhoto?: string;
};

type Tournament = {
  id: string;
  maxPlayers?: number;
  category?: string;

  scores?: Record<
    string,
    {
      p1Score: number;
      p2Score: number;
    }
  >;

  penaltyWinners?: Record<string, string>;

  matchPlayers?: Record<
    string,
    {
      player1Id: string;
      player2Id: string;
    }
  >;
};

type Registration = {
  id: string;
  userId: string;
  username?: string;
  eFootballUsername?: string;
  profilePhoto?: string;
  status?: string;
  createdAt?: {
    seconds?: number;
  };
};

type SavedScore = {
  p1Score: number;
  p2Score: number;
};

type SavedMatchPlayers = {
  player1Id: string;
  player2Id: string;
};

type Match = {
  id: number;
  player1: Player | null;
  player2: Player | null;
};

type FixtureTabProps = {
  tournament: Tournament;
  onTournamentUpdated?: (
    data: Partial<Tournament>
  ) => void;
};

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function FixtureTab8Players({
  tournament,
  onTournamentUpdated,
}: FixtureTabProps) {
  const [players, setPlayers] = useState<Player[]>([]);

  const [activeRound, setActiveRound] = useState<
    "quarter" | "semi" | "final"
  >("quarter");

  const [scores, setScores] = useState<
    Record<string, SavedScore>
  >(tournament.scores || {});

  const [matchPlayers, setMatchPlayers] = useState<
    Record<string, SavedMatchPlayers>
  >(tournament.matchPlayers || {});

  const [penaltyWinners, setPenaltyWinners] =
    useState<Record<string, string>>(
      tournament.penaltyWinners || {}
    );

  const [editingMatchId, setEditingMatchId] =
    useState<number | null>(null);

  const [editP1Score, setEditP1Score] =
    useState("");

  const [editP2Score, setEditP2Score] =
    useState("");

  const [editPlayer1, setEditPlayer1] =
    useState("");

  const [editPlayer2, setEditPlayer2] =
    useState("");

  const [editPenaltyWinner, setEditPenaltyWinner] =
    useState("");

  const [savingMatch, setSavingMatch] =
    useState<number | null>(null);

  /* ------------------------------------------------------------------------ */
  /* REALTIME TOURNAMENT LISTENER                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    loadPlayers();

    const tournamentRef = doc(
      db,
      "moneyTournaments",
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
          "Tournament listener error:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, [tournament.id]);

  /* ------------------------------------------------------------------------ */
  /* SYNC PROPS                                                               */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setScores(tournament.scores || {});
    setMatchPlayers(
      tournament.matchPlayers || {}
    );
    setPenaltyWinners(
      tournament.penaltyWinners || {}
    );
  }, [
    tournament.scores,
    tournament.matchPlayers,
    tournament.penaltyWinners,
  ]);

  /* ------------------------------------------------------------------------ */
  /* LOAD PLAYERS                                                             */
  /* ------------------------------------------------------------------------ */

  async function loadPlayers() {
    try {
      const registrationsQuery = query(
        collection(
          db,
          "moneyTournamentRegistrations"
        ),
        where(
          "tournamentId",
          "==",
          tournament.id
        )
      );

      const registrationSnap =
        await getDocs(
          registrationsQuery
        );

      const confirmedRegistrations: Registration[] =
  registrationSnap.docs
    .map(
      (item) =>
        ({
          id: item.id,
          ...item.data(),
        }) as Registration
    )
    .filter((item) => {
      return item.status === "confirmed";
    })
    .sort((a, b) => {
      const aTime =
        a.createdAt?.seconds || 0;

      const bTime =
        b.createdAt?.seconds || 0;

      return aTime - bTime;
    });

      const loadedPlayers: Player[] = [];

      for (const registration of confirmedRegistrations) {
        let username =
          registration.username ||
          registration.eFootballUsername ||
          "Player";

        let profilePhoto =
          registration.profilePhoto || "";

        if (
          !registration.username ||
          !registration.profilePhoto
        ) {
          try {
            const userSnap =
              await getDoc(
                doc(
                  db,
                  "users",
                  registration.userId
                )
              );

            if (userSnap.exists()) {
              const userData =
                userSnap.data();

              username =
                userData.username ||
                userData.eFootballUsername ||
                username;

              profilePhoto =
                userData.profilePhoto ||
                profilePhoto;
            }
          } catch {
            // Ignore missing user profile.
          }
        }

        loadedPlayers.push({
          id: registration.userId,
          username,
          profilePhoto,
        });
      }

      /*
       * 8-player tournament only.
       */
      setPlayers(
        loadedPlayers.slice(0, 8)
      );
    } catch (error) {
      console.error(
        "Failed to load tournament players:",
        error
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* QUARTER FINAL MATCHES                                                    */
  /* ------------------------------------------------------------------------ */

  const quarterMatches = useMemo<
    Match[]
  >(() => {
    const result: Match[] = [];

    for (let i = 0; i < 4; i++) {
      const matchId = i + 1;

      const saved =
        matchPlayers[String(matchId)];

      const defaultPlayer1 =
        players[i * 2] || null;

      const defaultPlayer2 =
        players[i * 2 + 1] || null;

      result.push({
        id: matchId,

        player1:
          players.find(
            (player) =>
              player.id ===
              saved?.player1Id
          ) ||
          defaultPlayer1,

        player2:
          players.find(
            (player) =>
              player.id ===
              saved?.player2Id
          ) ||
          defaultPlayer2,
      });
    }

    return result;
  }, [players, matchPlayers]);

  /* ------------------------------------------------------------------------ */
  /* WINNER                                                                   */
  /* ------------------------------------------------------------------------ */

  function getWinner(
    matchId: number
  ): Player | null {
    const match =
      getMatchById(matchId);

    if (
      !match?.player1 ||
      !match.player2
    ) {
      return null;
    }

    const score =
      scores[String(matchId)];

    if (!score) {
      return null;
    }

    if (
      score.p1Score >
      score.p2Score
    ) {
      return match.player1;
    }

    if (
      score.p2Score >
      score.p1Score
    ) {
      return match.player2;
    }

    const penaltyWinnerId =
      penaltyWinners[
        String(matchId)
      ];

    if (!penaltyWinnerId) {
      return null;
    }

    if (
      match.player1.id ===
      penaltyWinnerId
    ) {
      return match.player1;
    }

    if (
      match.player2.id ===
      penaltyWinnerId
    ) {
      return match.player2;
    }

    return null;
  }

  /* ------------------------------------------------------------------------ */
  /* MATCH LOOKUP                                                             */
  /* ------------------------------------------------------------------------ */

  function getMatchById(
    matchId: number
  ): Match | null {
    /*
     * Quarter Final
     * 1 - 4
     */
    if (
      matchId >= 1 &&
      matchId <= 4
    ) {
      return (
        quarterMatches.find(
          (match) =>
            match.id === matchId
        ) || null
      );
    }

    /*
     * Semi Final
     *
     * Match 5 = Winner 1 vs Winner 2
     * Match 6 = Winner 3 vs Winner 4
     */
    if (matchId === 5) {
      return {
        id: 5,
        player1: getWinner(1),
        player2: getWinner(2),
      };
    }

    if (matchId === 6) {
      return {
        id: 6,
        player1: getWinner(3),
        player2: getWinner(4),
      };
    }

    /*
     * Final
     *
     * Match 7 = Winner 5 vs Winner 6
     */
    if (matchId === 7) {
      return {
        id: 7,
        player1: getWinner(5),
        player2: getWinner(6),
      };
    }

    return null;
  }

  const semiMatches = useMemo<
    Match[]
  >(() => {
    return [
      {
        id: 5,
        player1: getWinner(1),
        player2: getWinner(2),
      },
      {
        id: 6,
        player1: getWinner(3),
        player2: getWinner(4),
      },
    ];
  }, [
    scores,
    penaltyWinners,
    quarterMatches,
  ]);

  const finalMatch = useMemo<Match>(
    () => {
      return {
        id: 7,
        player1: getWinner(5),
        player2: getWinner(6),
      };
    },
    [
      scores,
      penaltyWinners,
      semiMatches,
    ]
  );

  /* ------------------------------------------------------------------------ */
  /* START EDITING                                                            */
  /* ------------------------------------------------------------------------ */

  function startEditing(
    match: Match
  ) {
    const savedScore =
      scores[String(match.id)];

    const savedPlayers =
      matchPlayers[String(match.id)];

    const penaltyWinner =
      penaltyWinners[
        String(match.id)
      ];

    setEditingMatchId(match.id);

    setEditP1Score(
      savedScore
        ? String(savedScore.p1Score)
        : ""
    );

    setEditP2Score(
      savedScore
        ? String(savedScore.p2Score)
        : ""
    );

    setEditPlayer1(
      savedPlayers?.player1Id ||
        match.player1?.id ||
        ""
    );

    setEditPlayer2(
      savedPlayers?.player2Id ||
        match.player2?.id ||
        ""
    );

    setEditPenaltyWinner(
      penaltyWinner || ""
    );
  }

  /* ------------------------------------------------------------------------ */
  /* CANCEL EDIT                                                              */
  /* ------------------------------------------------------------------------ */

  function cancelEditing() {
    setEditingMatchId(null);

    setEditP1Score("");
    setEditP2Score("");

    setEditPlayer1("");
    setEditPlayer2("");

    setEditPenaltyWinner("");
  }

  /* ------------------------------------------------------------------------ */
  /* SAVE MATCH                                                               */
  /* ------------------------------------------------------------------------ */

  async function saveMatch(
    matchId: number
  ) {
    if (
      !editPlayer1 ||
      !editPlayer2
    ) {
      alert(
        "Please select both players."
      );
      return;
    }

    if (
      editPlayer1 ===
      editPlayer2
    ) {
      alert(
        "Same player cannot be selected twice."
      );
      return;
    }

    const p1Score =
      Number(editP1Score);

    const p2Score =
      Number(editP2Score);

    if (
      !Number.isInteger(
        p1Score
      ) ||
      p1Score < 0 ||
      !Number.isInteger(
        p2Score
      ) ||
      p2Score < 0
    ) {
      alert(
        "Please enter valid scores."
      );
      return;
    }

    if (
      p1Score === p2Score &&
      !editPenaltyWinner
    ) {
      alert(
        "Draw match-il penalty winner select cheyyanam."
      );
      return;
    }

    if (
      p1Score === p2Score &&
      editPenaltyWinner !==
        editPlayer1 &&
      editPenaltyWinner !==
        editPlayer2
    ) {
      alert(
        "Penalty winner must be one of the two players."
      );
      return;
    }

    try {
      setSavingMatch(matchId);

      const tournamentRef =
        doc(
          db,
          "moneyTournaments",
          tournament.id
        );

      const result =
        await runTransaction(
          db,
          async (transaction) => {
            const tournamentSnap =
              await transaction.get(
                tournamentRef
              );

            if (
              !tournamentSnap.exists()
            ) {
              throw new Error(
                "Tournament not found."
              );
            }

            const tournamentData =
              tournamentSnap.data();

            const oldScores =
              (tournamentData.scores ||
                {}) as Record<
                string,
                SavedScore
              >;

            const oldMatchPlayers =
              (tournamentData.matchPlayers ||
                {}) as Record<
                string,
                SavedMatchPlayers
              >;

            const oldPenaltyWinners =
              (tournamentData.penaltyWinners ||
                {}) as Record<
                string,
                string
              >;

            /*
             * Tracks players who already
             * participated in this tournament.
             */
            const playedUsersMap =
              (tournamentData.playedUsersMap ||
                {}) as Record<
                string,
                boolean
              >;

            const newScores: Record<
              string,
              SavedScore
            > = {
              ...oldScores,

              [String(matchId)]: {
                p1Score,
                p2Score,
              },
            };

            const newMatchPlayers: Record<
              string,
              SavedMatchPlayers
            > = {
              ...oldMatchPlayers,

              [String(matchId)]: {
                player1Id:
                  editPlayer1,
                player2Id:
                  editPlayer2,
              },
            };

            const newPenaltyWinners: Record<
              string,
              string
            > = {
              ...oldPenaltyWinners,
            };

            if (
              p1Score ===
              p2Score
            ) {
              newPenaltyWinners[
                String(matchId)
              ] =
                editPenaltyWinner;
            } else {
              delete newPenaltyWinners[
                String(matchId)
              ];
            }

            /*
             * First completed match
             * participation tracking.
             */
            const newPlayedUsersMap =
              {
                ...playedUsersMap,
              };

            let p1TournamentPlayedDelta =
              0;

            let p2TournamentPlayedDelta =
              0;

            if (
              !newPlayedUsersMap[
                editPlayer1
              ]
            ) {
              newPlayedUsersMap[
                editPlayer1
              ] = true;

              p1TournamentPlayedDelta =
                1;
            }

            if (
              !newPlayedUsersMap[
                editPlayer2
              ]
            ) {
              newPlayedUsersMap[
                editPlayer2
              ] = true;

              p2TournamentPlayedDelta =
                1;
            }

            /* ------------------------------------------------------------ */
            /* FINAL WINNER / RUNNER                                         */
            /* ------------------------------------------------------------ */

            let winnerId = "";
            let runnerId = "";

            /*
             * 8-player tournament:
             * Match 7 = Final
             */
            if (
              String(matchId) ===
              "7"
            ) {
              if (
                p1Score >
                p2Score
              ) {
                winnerId =
                  editPlayer1;

                runnerId =
                  editPlayer2;
              } else if (
                p2Score >
                p1Score
              ) {
                winnerId =
                  editPlayer2;

                runnerId =
                  editPlayer1;
              } else if (
                editPenaltyWinner
              ) {
                winnerId =
                  editPenaltyWinner;

                runnerId =
                  editPenaltyWinner ===
                  editPlayer1
                    ? editPlayer2
                    : editPlayer1;
              }
            }

            /* ------------------------------------------------------------ */
            /* READ USERS                                                     */
            /* ------------------------------------------------------------ */

            const affectedUserIds =
              new Set<string>([
                editPlayer1,
                editPlayer2,
              ]);

            const userSnapshots: {
              userId: string;
              userRef: ReturnType<
                typeof doc
              >;
              userSnap: Awaited<
                ReturnType<
                  typeof getDoc
                >
              >;
            }[] = [];

            for (
              const userId of
                affectedUserIds
            ) {
              const userRef =
                doc(
                  db,
                  "users",
                  userId
                );

              const userSnap =
                await transaction.get(
                  userRef
                );

              userSnapshots.push({
                userId,
                userRef,
                userSnap,
              });
            }

            /* ------------------------------------------------------------ */
            /* TOURNAMENT UPDATE                                             */
            /* ------------------------------------------------------------ */

            const tournamentUpdateData: Record<
              string,
              unknown
            > = {
              [`scores.${matchId}`]: {
                p1Score,
                p2Score,
              },

              [`matchPlayers.${matchId}`]: {
                player1Id:
                  editPlayer1,
                player2Id:
                  editPlayer2,
              },

              playedUsersMap:
                newPlayedUsersMap,

              updatedAt:
                serverTimestamp(),
            };

            if (
              p1Score ===
              p2Score
            ) {
              tournamentUpdateData[
                `penaltyWinners.${matchId}`
              ] =
                editPenaltyWinner;
            } else {
              tournamentUpdateData[
                `penaltyWinners.${matchId}`
              ] =
                deleteField();
            }

            if (
              winnerId &&
              runnerId
            ) {
              tournamentUpdateData[
                "winnerId"
              ] = winnerId;

              tournamentUpdateData[
                "runnerId"
              ] = runnerId;
            }

            transaction.update(
              tournamentRef,
              tournamentUpdateData
            );

            /* ------------------------------------------------------------ */
            /* USER STATS                                                     */
            /* ------------------------------------------------------------ */

            for (
              const user of
                userSnapshots
            ) {
              const userId =
                user.userId;

              const isP1 =
                userId ===
                editPlayer1;

              const pScore = isP1
                ? p1Score
                : p2Score;

              const oScore = isP1
                ? p2Score
                : p1Score;

              let isWin =
                pScore >
                oScore;

              let isLoss =
                oScore >
                pScore;

              if (
                pScore ===
                oScore
              ) {
                isWin =
                  editPenaltyWinner ===
                  userId;

                isLoss =
                  editPenaltyWinner !==
                    userId &&
                  editPenaltyWinner !==
                    "";
              }

              const playedDelta =
                isP1
                  ? p1TournamentPlayedDelta
                  : p2TournamentPlayedDelta;

              const isWinnerOfTournament =
                userId ===
                winnerId;

              const isRunnerOfTournament =
                userId ===
                runnerId;

              const currentData = user.userSnap.exists()
  ? (user.userSnap.data() as {
      tournamentStats?: {
        goals?: number;
        conceded?: number;
        wins?: number;
        losses?: number;
        matches?: number;
        tournamentPlayed?: number;
        tournamentWon?: number;
        tournamentRunner?: number;
      };
    })
  : {};

const currentStats =
  currentData.tournamentStats || {};

              const nextStats = {
                ...currentStats,

                goals:
                  Number(
                    currentStats.goals ||
                      0
                  ) + pScore,

                conceded:
                  Number(
                    currentStats.conceded ||
                      0
                  ) + oScore,

                wins:
                  Number(
                    currentStats.wins ||
                      0
                  ) +
                  (isWin ? 1 : 0),

                losses:
                  Number(
                    currentStats.losses ||
                      0
                  ) +
                  (isLoss ? 1 : 0),

                matches:
                  Number(
                    currentStats.matches ||
                      0
                  ) + 1,

                tournamentPlayed:
                  Number(
                    currentStats.tournamentPlayed ||
                      0
                  ) +
                  playedDelta,

                tournamentWon:
                  Number(
                    currentStats.tournamentWon ||
                      0
                  ) +
                  (isWinnerOfTournament
                    ? 1
                    : 0),

                tournamentRunner:
                  Number(
                    currentStats.tournamentRunner ||
                      0
                  ) +
                  (isRunnerOfTournament
                    ? 1
                    : 0),
              };

              transaction.set(
                user.userRef,
                {
                  tournamentStats:
                    nextStats,
                },
                {
                  merge: true,
                }
              );
            }

            return {
              newScores,
              newMatchPlayers,
              newPenaltyWinners,
            };
          }
        );

      /* ------------------------------------------------------------------ */
      /* LOCAL STATE                                                        */
      /* ------------------------------------------------------------------ */

      setScores(
        result.newScores
      );

      setMatchPlayers(
        result.newMatchPlayers
      );

      setPenaltyWinners(
        result.newPenaltyWinners
      );

      onTournamentUpdated?.({
        scores:
          result.newScores,

        matchPlayers:
          result.newMatchPlayers,

        penaltyWinners:
          result.newPenaltyWinners,
      });

      cancelEditing();

      alert(
        "Match score and player stats updated successfully."
      );
    } catch (error) {
      console.error(
        "Failed to save match and update user stats:",
        error
      );

      alert(
        "Failed to save match and update user stats."
      );
    } finally {
      setSavingMatch(null);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* EDIT PLAYERS                                                             */
  /* ------------------------------------------------------------------------ */

  const allPlayersForEdit =
    players;

  /* ------------------------------------------------------------------------ */
  /* RENDER                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="w-full">
      {/* ------------------------------------------------------------------ */}
      {/* ROUND NAVIGATION                                                    */}
      {/* ------------------------------------------------------------------ */}

      <div className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-white">
        <div className="flex overflow-x-auto">
          <RoundTab
            active={
              activeRound ===
              "quarter"
            }
            onClick={() =>
              setActiveRound(
                "quarter"
              )
            }
          >
            Quarter-final
          </RoundTab>

          <RoundTab
            active={
              activeRound ===
              "semi"
            }
            onClick={() =>
              setActiveRound(
                "semi"
              )
            }
          >
            Semi-final
          </RoundTab>

          <RoundTab
            active={
              activeRound ===
              "final"
            }
            onClick={() =>
              setActiveRound(
                "final"
              )
            }
          >
            Final
          </RoundTab>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* QUARTER FINAL                                                       */}
      {/* ------------------------------------------------------------------ */}

      {activeRound ===
        "quarter" && (
        <div className="overflow-x-auto bg-[#f3f4f6] p-4">
          <div className="flex min-w-[680px] gap-10">
            <div className="w-[340px] shrink-0">
              <SectionTitle
                title="Quarter-final"
              />

              <div className="space-y-6 pt-3">
                {quarterMatches.map(
                  (match) => (
                    <AdminMatchCard
                      key={match.id}
                      match={match}
                      score={
                        scores[
                          String(
                            match.id
                          )
                        ]
                      }
                      penaltyWinnerId={
                        penaltyWinners[
                          String(
                            match.id
                          )
                        ]
                      }
                      editing={
                        editingMatchId ===
                        match.id
                      }
                      saving={
                        savingMatch ===
                        match.id
                      }
                      players={
                        allPlayersForEdit
                      }
                      editPlayer1={
                        editPlayer1
                      }
                      editPlayer2={
                        editPlayer2
                      }
                      editP1Score={
                        editP1Score
                      }
                      editP2Score={
                        editP2Score
                      }
                      editPenaltyWinner={
                        editPenaltyWinner
                      }
                      onEdit={() =>
                        startEditing(
                          match
                        )
                      }
                      onCancel={
                        cancelEditing
                      }
                      onSave={() =>
                        saveMatch(
                          match.id
                        )
                      }
                      onPlayer1Change={
                        setEditPlayer1
                      }
                      onPlayer2Change={
                        setEditPlayer2
                      }
                      onP1ScoreChange={
                        setEditP1Score
                      }
                      onP2ScoreChange={
                        setEditP2Score
                      }
                      onPenaltyWinnerChange={
                        setEditPenaltyWinner
                      }
                    />
                  )
                )}
              </div>
            </div>

            <div className="w-[300px] shrink-0">
              <SectionTitle
                title="Semi-final Preview"
              />

              <div className="space-y-10 pt-6">
                {semiMatches.map(
                  (match) => (
                    <PreviewMatchCard
                      key={match.id}
                      match={match}
                      score={
                        scores[
                          String(
                            match.id
                          )
                        ]
                      }
                    />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SEMI FINAL                                                          */}
      {/* ------------------------------------------------------------------ */}

      {activeRound ===
        "semi" && (
        <div className="overflow-x-auto bg-[#f3f4f6] p-4">
          <div className="flex min-w-[680px] gap-10">
            <div className="w-[340px] shrink-0">
              <SectionTitle
                title="Semi-final"
              />

              <div className="space-y-6 pt-3">
                {semiMatches.map(
                  (match) => (
                    <AdminMatchCard
                      key={match.id}
                      match={match}
                      score={
                        scores[
                          String(
                            match.id
                          )
                        ]
                      }
                      penaltyWinnerId={
                        penaltyWinners[
                          String(
                            match.id
                          )
                        ]
                      }
                      editing={
                        editingMatchId ===
                        match.id
                      }
                      saving={
                        savingMatch ===
                        match.id
                      }
                      players={
                        allPlayersForEdit
                      }
                      editPlayer1={
                        editPlayer1
                      }
                      editPlayer2={
                        editPlayer2
                      }
                      editP1Score={
                        editP1Score
                      }
                      editP2Score={
                        editP2Score
                      }
                      editPenaltyWinner={
                        editPenaltyWinner
                      }
                      onEdit={() =>
                        startEditing(
                          match
                        )
                      }
                      onCancel={
                        cancelEditing
                      }
                      onSave={() =>
                        saveMatch(
                          match.id
                        )
                      }
                      onPlayer1Change={
                        setEditPlayer1
                      }
                      onPlayer2Change={
                        setEditPlayer2
                      }
                      onP1ScoreChange={
                        setEditP1Score
                      }
                      onP2ScoreChange={
                        setEditP2Score
                      }
                      onPenaltyWinnerChange={
                        setEditPenaltyWinner
                      }
                    />
                  )
                )}
              </div>
            </div>

            <div className="w-[300px] shrink-0">
              <SectionTitle
                title="Final Preview"
              />

              <div className="pt-10">
                <PreviewMatchCard
                  match={
                    finalMatch
                  }
                  score={
                    scores["7"]
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* FINAL                                                               */}
      {/* ------------------------------------------------------------------ */}

      {activeRound ===
        "final" && (
        <div className="bg-[#f3f4f6] p-4">
          <SectionTitle
            title="Grand Final"
          />

          <div className="mt-5">
            <FinalAdminMatchCard
              match={finalMatch}
              score={scores["7"]}
              penaltyWinnerId={
                penaltyWinners["7"]
              }
              editing={
                editingMatchId ===
                7
              }
              saving={
                savingMatch ===
                7
              }
              players={
                allPlayersForEdit
              }
              editPlayer1={
                editPlayer1
              }
              editPlayer2={
                editPlayer2
              }
              editP1Score={
                editP1Score
              }
              editP2Score={
                editP2Score
              }
              editPenaltyWinner={
                editPenaltyWinner
              }
              onEdit={() =>
                startEditing(
                  finalMatch
                )
              }
              onCancel={
                cancelEditing
              }
              onSave={() =>
                saveMatch(7)
              }
              onPlayer1Change={
                setEditPlayer1
              }
              onPlayer2Change={
                setEditPlayer2
              }
              onP1ScoreChange={
                setEditP1Score
              }
              onP2ScoreChange={
                setEditP2Score
              }
              onPenaltyWinnerChange={
                setEditPenaltyWinner
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ROUND TAB                                                                  */
/* -------------------------------------------------------------------------- */

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
      className={`whitespace-nowrap px-5 py-3 text-[11px] font-black ${
        active
          ? "border-b-[3px] border-[#18a957] text-[#18a957]"
          : "text-[#999]"
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* SECTION TITLE                                                              */
/* -------------------------------------------------------------------------- */

function SectionTitle({
  title,
}: {
  title: string;
}) {
  return (
    <div className="mb-3 text-[13px] font-black text-[#222]">
      {title}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ADMIN MATCH CARD                                                           */
/* -------------------------------------------------------------------------- */

function AdminMatchCard({
  match,
  score,
  penaltyWinnerId,
  editing,
  saving,
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
}: {
  match: Match;
  score?: SavedScore;
  penaltyWinnerId?: string;

  editing: boolean;
  saving: boolean;

  players: Player[];

  editPlayer1: string;
  editPlayer2: string;

  editP1Score: string;
  editP2Score: string;

  editPenaltyWinner: string;

  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;

  onPlayer1Change: (
    value: string
  ) => void;

  onPlayer2Change: (
    value: string
  ) => void;

  onP1ScoreChange: (
    value: string
  ) => void;

  onP2ScoreChange: (
    value: string
  ) => void;

  onPenaltyWinnerChange: (
    value: string
  ) => void;
}) {
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
          onChange={
            onPlayer1Change
          }
        />

        <div className="my-3">
          <input
            type="number"
            min="0"
            value={editP1Score}
            onChange={(e) =>
              onP1ScoreChange(
                e.target.value
              )
            }
            placeholder="Player 1 score"
            className="w-full rounded-xl border border-[#ddd] px-3 py-3 text-sm font-bold outline-none focus:border-[#18a957]"
          />
        </div>

        <EditPlayerSelect
          label="Player 2"
          value={editPlayer2}
          players={players}
          onChange={
            onPlayer2Change
          }
        />

        <div className="my-3">
          <input
            type="number"
            min="0"
            value={editP2Score}
            onChange={(e) =>
              onP2ScoreChange(
                e.target.value
              )
            }
            placeholder="Player 2 score"
            className="w-full rounded-xl border border-[#ddd] px-3 py-3 text-sm font-bold outline-none focus:border-[#18a957]"
          />
        </div>

        {editP1Score !== "" &&
          editP2Score !== "" &&
          Number(
            editP1Score
          ) ===
            Number(
              editP2Score
            ) && (
            <div className="mb-3 rounded-xl bg-[#fff7e6] p-3">
              <div className="mb-2 text-[10px] font-black uppercase text-[#a06a00]">
                Penalty Winner
              </div>

              <select
                value={
                  editPenaltyWinner
                }
                onChange={(e) =>
                  onPenaltyWinnerChange(
                    e.target.value
                  )
                }
                className="w-full rounded-xl border border-[#e2d2a8] bg-white px-3 py-3 text-sm font-bold outline-none"
              >
                <option value="">
                  Select penalty winner
                </option>

                {[
                  editPlayer1,
                  editPlayer2,
                ]
                  .map(
                    (id) =>
                      players.find(
                        (player) =>
                          player.id ===
                          id
                      )
                  )
                  .filter(
                    (
                      player
                    ): player is Player =>
                      Boolean(player)
                  )
                  .map(
                    (player) => (
                      <option
                        key={
                          player.id
                        }
                        value={
                          player.id
                        }
                      >
                        {
                          player.username
                        }
                      </option>
                    )
                  )}
              </select>
            </div>
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
            {saving
              ? "SAVING..."
              : "SAVE"}
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
          className="rounded-lg bg-[#eef9f2] px-3 py-1.5 text-[10px] font-black text-[#18a957]"
        >
          EDIT
        </button>
      </div>

      <PlayerScoreRow
        player={match.player1}
        score={score?.p1Score}
        winner={Boolean(
          score &&
            match.player1 &&
            (
              score.p1Score >
                score.p2Score ||
              (
                score.p1Score ===
                  score.p2Score &&
                penaltyWinnerId ===
                  match.player1.id
              )
            )
        )}
      />

      <div className="my-2 border-t border-dashed border-[#e5e5e5]" />

      <PlayerScoreRow
        player={match.player2}
        score={score?.p2Score}
        winner={Boolean(
          score &&
            match.player2 &&
            (
              score.p2Score >
                score.p1Score ||
              (
                score.p1Score ===
                  score.p2Score &&
                penaltyWinnerId ===
                  match.player2.id
              )
            )
        )}
      />

      {score &&
        score.p1Score ===
          score.p2Score &&
        penaltyWinnerId && (
          <div className="mt-3 rounded-lg bg-[#fff7e6] px-3 py-2 text-center text-[9px] font-black text-[#a06a00]">
            PENALTY WINNER
          </div>
        )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FINAL ADMIN CARD                                                           */
/* -------------------------------------------------------------------------- */

function FinalAdminMatchCard({
  match,
  score,
  penaltyWinnerId,
  editing,
  saving,
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
}: any) {
  if (editing) {
    return (
      <AdminMatchCard
        match={match}
        score={score}
        penaltyWinnerId={
          penaltyWinnerId
        }
        editing={editing}
        saving={saving}
        players={players}
        editPlayer1={
          editPlayer1
        }
        editPlayer2={
          editPlayer2
        }
        editP1Score={
          editP1Score
        }
        editP2Score={
          editP2Score
        }
        editPenaltyWinner={
          editPenaltyWinner
        }
        onEdit={onEdit}
        onCancel={onCancel}
        onSave={onSave}
        onPlayer1Change={
          onPlayer1Change
        }
        onPlayer2Change={
          onPlayer2Change
        }
        onP1ScoreChange={
          onP1ScoreChange
        }
        onP2ScoreChange={
          onP2ScoreChange
        }
        onPenaltyWinnerChange={
          onPenaltyWinnerChange
        }
      />
    );
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-lg">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#999]">
            Grand Final
          </div>

          <div className="mt-1 text-base font-black text-[#222]">
            Match 7
          </div>
        </div>

        <div className="text-2xl">
          🏆
        </div>
      </div>

      <PlayerScoreRow
        player={match.player1}
        score={score?.p1Score}
        winner={Boolean(
          score &&
            match.player1 &&
            (
              score.p1Score >
                score.p2Score ||
              (
                score.p1Score ===
                  score.p2Score &&
                penaltyWinnerId ===
                  match.player1.id
              )
            )
        )}
      />

      <div className="my-4 border-t border-dashed border-[#ddd]" />

      <PlayerScoreRow
        player={match.player2}
        score={score?.p2Score}
        winner={Boolean(
          score &&
            match.player2 &&
            (
              score.p2Score >
                score.p1Score ||
              (
                score.p1Score ===
                  score.p2Score &&
                penaltyWinnerId ===
                  match.player2.id
              )
            )
        )}
      />

      <button
        type="button"
        onClick={onEdit}
        className="mt-5 w-full rounded-xl bg-[#18a957] py-3 text-xs font-black text-white"
      >
        EDIT FINAL
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PLAYER SELECT                                                              */
/* -------------------------------------------------------------------------- */

function EditPlayerSelect({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string;
  players: Player[];
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-black uppercase text-[#888]">
        {label}
      </div>

      <select
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
        className="w-full rounded-xl border border-[#ddd] bg-white px-3 py-3 text-sm font-bold outline-none focus:border-[#18a957]"
      >
        <option value="">
          Select player
        </option>

        {players.map(
          (player) => (
            <option
              key={player.id}
              value={player.id}
            >
              {player.username}
            </option>
          )
        )}
      </select>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PREVIEW CARD                                                               */
/* -------------------------------------------------------------------------- */

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

      <PlayerScoreRow
        player={match.player1}
        score={score?.p1Score}
      />

      <div className="my-2 border-t border-[#eee]" />

      <PlayerScoreRow
        player={match.player2}
        score={score?.p2Score}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PLAYER ROW                                                                 */
/* -------------------------------------------------------------------------- */

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
      <PlayerAvatar
        player={player}
      />

      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[12px] ${
            winner
              ? "font-black text-[#18a957]"
              : "font-bold text-[#333]"
          }`}
        >
          {player?.username ||
            "Waiting..."}
        </div>

        {winner && (
          <div className="mt-0.5 text-[8px] font-black uppercase text-[#18a957]">
            Winner
          </div>
        )}
      </div>

      <div className="min-w-[24px] text-center text-lg font-black text-[#222]">
        {typeof score ===
        "number"
          ? score
          : "-"}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AVATAR                                                                     */
/* -------------------------------------------------------------------------- */

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