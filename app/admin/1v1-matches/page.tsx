"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

/* =====================================================
   TYPES
===================================================== */

type OneVsOneMatch = {
  id: string;

  hostId: string;
  hostName: string;
  hostEmail?: string;

  opponentId?: string | null;
  opponentName?: string;
  opponentEmail?: string;

  date: string;
  time: string;

  entryFee: number;
  winnerReward: number;

  status: string;
  adminApproved?: boolean;

  roomCode?: string;

  hostScore?: number | null;
  opponentScore?: number | null;

  winnerId?: string | null;
  winnerName?: string;

  rewardCredited?: boolean;
  statsApplied?: boolean;
};

type ScoreInput = {
  host: string;
  opponent: string;
};

type DetailInput = {
  date: string;
  time: string;
  entryFee: string;
  winnerReward: string;
  roomCode: string;
};

type TabType = "requested" | "manage";

type SectionType = "waiting" | "matched" | "completed" | "other";

/* =====================================================
   MAIN COMPONENT
===================================================== */

export default function AdminOneVsOneMatchesPage() {
  const router = useRouter();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [matches, setMatches] = useState<OneVsOneMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>("requested");

  const [expandedId, setExpandedId] = useState("");

  const [busyId, setBusyId] = useState("");

  const [scores, setScores] = useState<Record<string, ScoreInput>>({});
  const [details, setDetails] = useState<Record<string, DetailInput>>({});

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /* =====================================================
     ADMIN CHECK
  ===================================================== */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
          setIsAdmin(false);
          setCheckingAdmin(false);
          router.replace("/");
          return;
        }

        setIsAdmin(true);
        setCheckingAdmin(false);
      } catch (err) {
        console.error("Admin verification failed:", err);

        setIsAdmin(false);
        setCheckingAdmin(false);

        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [router]);

  /* =====================================================
     LOAD MATCHES + USERNAMES
  ===================================================== */

  useEffect(() => {
    if (!isAdmin) return;

    setLoadingMatches(true);

    const matchesQuery = query(
      collection(db, "oneVsOneMatches"),
      orderBy("createdAt", "desc")
    );

    let active = true;

    const unsubscribe = onSnapshot(
      matchesQuery,
      async (snapshot) => {
        try {
          const loadedMatches = await Promise.all(
            snapshot.docs.map(async (item) => {
              const value = item.data();

              let hostName = String(value.hostName ?? "Host");
              let opponentName = String(value.opponentName ?? "");

              // Old records may contain email instead of username.
              if (
                value.hostId &&
                (!hostName || hostName.includes("@"))
              ) {
                try {
                  const hostSnap = await getDoc(
                    doc(db, "users", value.hostId)
                  );

                  if (hostSnap.exists()) {
                    hostName =
                      String(hostSnap.data().username ?? "").trim() ||
                      "Host";
                  }
                } catch (err) {
                  console.error("Host username error:", err);
                }
              }

              if (
                value.opponentId &&
                (!opponentName || opponentName.includes("@"))
              ) {
                try {
                  const opponentSnap = await getDoc(
                    doc(db, "users", value.opponentId)
                  );

                  if (opponentSnap.exists()) {
                    opponentName =
                      String(opponentSnap.data().username ?? "").trim() ||
                      "Opponent";
                  }
                } catch (err) {
                  console.error("Opponent username error:", err);
                }
              }

              return {
                id: item.id,

                hostId: value.hostId ?? "",
                hostName,
                hostEmail: value.hostEmail ?? "",

                opponentId: value.opponentId ?? null,
                opponentName,
                opponentEmail: value.opponentEmail ?? "",

                date: value.date ?? "",
                time: value.time ?? "",

                entryFee: Number(value.entryFee ?? 0),
                winnerReward: Number(value.winnerReward ?? 0),

                status: value.status ?? "pending_admin_approval",
                adminApproved: value.adminApproved ?? false,

                roomCode: value.roomCode ?? "",

                hostScore: value.hostScore ?? null,
                opponentScore: value.opponentScore ?? null,

                winnerId: value.winnerId ?? null,
                winnerName: value.winnerName ?? "",

                rewardCredited: value.rewardCredited ?? false,
                statsApplied: value.statsApplied ?? false,
              } as OneVsOneMatch;
            })
          );

          if (active) {
            setMatches(loadedMatches);
            setLoadingMatches(false);
          }
        } catch (err) {
          console.error("Loading matches failed:", err);

          if (active) {
            setError("Failed to load matches.");
            setLoadingMatches(false);
          }
        }
      },
      (err) => {
        console.error("Failed to load 1v1 matches:", err);

        if (active) {
          setError("Failed to load matches. Check Firestore permissions.");
          setLoadingMatches(false);
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isAdmin]);

  /* =====================================================
     ACCEPT REQUEST
  ===================================================== */

  async function acceptRequest(match: OneVsOneMatch) {
    setError("");
    setMessage("");

    if (match.status !== "pending_admin_approval") {
      setError("This request is no longer pending.");
      return;
    }

    try {
      setBusyId(match.id);

      await updateDoc(doc(db, "oneVsOneMatches", match.id), {
        status: "waiting_for_opponent",
        adminApproved: true,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage("Match request approved successfully.");
    } catch (err) {
      console.error("Accept request failed:", err);
      setError("Unable to approve this request.");
    } finally {
      setBusyId("");
    }
  }

  /* =====================================================
     REJECT REQUEST
  ===================================================== */

  async function rejectRequest(match: OneVsOneMatch) {
    const confirmed = window.confirm(
      "Are you sure you want to reject this match request?"
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      setBusyId(match.id);

      await updateDoc(doc(db, "oneVsOneMatches", match.id), {
        status: "rejected",
        adminApproved: false,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage("Match request rejected.");
    } catch (err) {
      console.error("Reject request failed:", err);
      setError("Unable to reject this request.");
    } finally {
      setBusyId("");
    }
  }

  /* =====================================================
     SAVE MATCH DETAILS
  ===================================================== */

  async function saveMatchDetails(match: OneVsOneMatch) {
    setError("");
    setMessage("");

    const input = details[match.id];

    if (!input) {
      setError("No changes found.");
      return;
    }

    const entryFee = Number(input.entryFee);
    const winnerReward = Number(input.winnerReward);

    if (
      !input.date.trim() ||
      !input.time.trim() ||
      !Number.isFinite(entryFee) ||
      entryFee < 0 ||
      !Number.isFinite(winnerReward) ||
      winnerReward <= 0
    ) {
      setError("Please enter valid match details.");
      return;
    }

    try {
      setBusyId(match.id);

      await updateDoc(doc(db, "oneVsOneMatches", match.id), {
        date: input.date.trim(),
        time: input.time.trim(),
        entryFee,
        winnerReward,
        updatedAt: serverTimestamp(),
      });

      setMessage("Match details updated successfully.");
    } catch (err) {
      console.error("Saving match details failed:", err);
      setError("Unable to update match details.");
    } finally {
      setBusyId("");
    }
  }

  /* =====================================================
     ADD / UPDATE ROOM CODE
  ===================================================== */

  async function addRoomCode(match: OneVsOneMatch) {
    setError("");
    setMessage("");

    const roomCode = (
      details[match.id]?.roomCode ??
      match.roomCode ??
      ""
    ).trim();

    if (!roomCode) {
      setError("Please enter the room code.");
      return;
    }

    if (
      match.status !== "matched" &&
      match.status !== "room_code_added" &&
      match.status !== "completed"
    ) {
      setError("Room code can only be added after an opponent joins.");
      return;
    }

    try {
      setBusyId(match.id);

      const nextStatus =
        match.status === "matched"
          ? "room_code_added"
          : match.status;

      await updateDoc(doc(db, "oneVsOneMatches", match.id), {
        roomCode,
        status: nextStatus,
        roomCodeAddedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage("Room code saved successfully.");
    } catch (err) {
      console.error("Adding room code failed:", err);
      setError("Unable to save room code.");
    } finally {
      setBusyId("");
    }
  }

  /* =====================================================
     SUBMIT / EDIT RESULT + UPDATE PLAYER STATS
     + REVERSE OLD REWARD + CREDIT NEW WINNER
  ===================================================== */

  async function submitResult(match: OneVsOneMatch) {
    setError("");
    setMessage("");

    const scoreInput = scores[match.id];

    const hostScore = Number(scoreInput?.host);
    const opponentScore = Number(scoreInput?.opponent);

    if (
      scoreInput?.host === undefined ||
      scoreInput.host.trim() === "" ||
      scoreInput?.opponent === undefined ||
      scoreInput.opponent.trim() === "" ||
      !Number.isInteger(hostScore) ||
      !Number.isInteger(opponentScore) ||
      hostScore < 0 ||
      opponentScore < 0
    ) {
      setError("Enter valid scores for both players.");
      return;
    }

    if (hostScore === opponentScore) {
      setError("Draw result is not supported.");
      return;
    }

    if (!match.opponentId) {
      setError("Opponent has not joined this match.");
      return;
    }

    if (
      match.status !== "matched" &&
      match.status !== "room_code_added" &&
      match.status !== "completed"
    ) {
      setError("This match is not ready for result submission.");
      return;
    }

    const winnerId =
      hostScore > opponentScore
        ? match.hostId
        : match.opponentId;

    const winnerName =
      hostScore > opponentScore
        ? match.hostName
        : match.opponentName || "Opponent";

    const confirmed = window.confirm(
      `P1: ${hostScore}\nP2: ${opponentScore}\n\nWinner: ${winnerName}\nReward: ₹${match.winnerReward}\n\nSubmit result and update player stats?`
    );

    if (!confirmed) return;

    try {
      setBusyId(match.id);

      await runTransaction(db, async (transaction) => {
        const matchRef = doc(db, "oneVsOneMatches", match.id);

        const matchSnap = await transaction.get(matchRef);

        if (!matchSnap.exists()) {
          throw new Error("MATCH_NOT_FOUND");
        }

        const currentMatch = matchSnap.data();

        if (
          currentMatch.status !== "matched" &&
          currentMatch.status !== "room_code_added" &&
          currentMatch.status !== "completed"
        ) {
          throw new Error("MATCH_NOT_READY");
        }

        if (
          currentMatch.hostId !== match.hostId ||
          currentMatch.opponentId !== match.opponentId
        ) {
          throw new Error("PLAYER_DETAILS_CHANGED");
        }

        const hostId = match.hostId;
const opponentId = match.opponentId;

if (!hostId || !opponentId) {
  throw new Error("PLAYER_ID_MISSING");
}

const hostRef = doc(db, "users", hostId);
const opponentRef = doc(db, "users", opponentId);

        // Read both player documents before making writes.
        const hostSnap = await transaction.get(hostRef);
        const opponentSnap = await transaction.get(opponentRef);

        if (!hostSnap.exists() || !opponentSnap.exists()) {
          throw new Error("PLAYER_USER_NOT_FOUND");
        }

        const hostData = hostSnap.data();
        const opponentData = opponentSnap.data();

        const hostStats = hostData.tournamentStats ?? {};
        const opponentStats = opponentData.tournamentStats ?? {};

        const oldHostScore = Number(currentMatch.hostScore);
        const oldOpponentScore = Number(currentMatch.opponentScore);

        const oldStatsApplied = currentMatch.statsApplied === true;

        const oldResultExists =
          Number.isInteger(oldHostScore) &&
          Number.isInteger(oldOpponentScore);

        if (oldStatsApplied && !oldResultExists) {
          throw new Error("OLD_SCORE_NOT_FOUND");
        }

        /*
          -----------------------------------------------
          HOST STATS
          -----------------------------------------------
        */

        let hostGoals = Number(hostStats.goals ?? 0);
        let hostConceded = Number(hostStats.conceded ?? 0);
        let hostWins = Number(hostStats.wins ?? 0);
        let hostLosses = Number(hostStats.losses ?? 0);
        let hostMatches = Number(hostStats.matches ?? 0);

        /*
          -----------------------------------------------
          OPPONENT STATS
          -----------------------------------------------
        */

        let opponentGoals = Number(opponentStats.goals ?? 0);
        let opponentConceded = Number(opponentStats.conceded ?? 0);
        let opponentWins = Number(opponentStats.wins ?? 0);
        let opponentLosses = Number(opponentStats.losses ?? 0);
        let opponentMatches = Number(opponentStats.matches ?? 0);

        /*
          -----------------------------------------------
          REVERSE OLD RESULT STATS
          Only when statsApplied === true
          -----------------------------------------------
        */

        if (oldStatsApplied) {
          const oldHostWon = oldHostScore > oldOpponentScore;

          const oldOpponentWon =
            oldOpponentScore > oldHostScore;

          hostGoals -= oldHostScore;
          hostConceded -= oldOpponentScore;

          opponentGoals -= oldOpponentScore;
          opponentConceded -= oldHostScore;

          if (oldHostWon) {
            hostWins -= 1;
            opponentLosses -= 1;
          } else if (oldOpponentWon) {
            opponentWins -= 1;
            hostLosses -= 1;
          }
        }

        /*
          -----------------------------------------------
          APPLY NEW RESULT STATS
          -----------------------------------------------
        */

        hostGoals += hostScore;
        hostConceded += opponentScore;

        opponentGoals += opponentScore;
        opponentConceded += hostScore;

        if (hostScore > opponentScore) {
          hostWins += 1;
          opponentLosses += 1;
        } else {
          opponentWins += 1;
          hostLosses += 1;
        }

        // A match should only be counted once.
        if (!oldStatsApplied) {
          hostMatches += 1;
          opponentMatches += 1;
        }

        /*
          -----------------------------------------------
          REWARD REVERSAL + NEW REWARD
          -----------------------------------------------
        */

        let hostBalance = Number(hostData.winningsBalance ?? 0);
        let opponentBalance = Number(
          opponentData.winningsBalance ?? 0
        );

        const oldRewardCredited =
          currentMatch.rewardCredited === true;

        const oldWinnerId = currentMatch.winnerId ?? null;

        const oldReward = Number(
          currentMatch.winnerReward ?? 0
        );

        // Reverse the previous credited reward.
        if (oldRewardCredited && oldWinnerId) {
          if (oldWinnerId === match.hostId) {
            hostBalance -= oldReward;
          } else if (oldWinnerId === match.opponentId) {
            opponentBalance -= oldReward;
          } else {
            throw new Error("OLD_WINNER_NOT_FOUND");
          }
        }

        const newReward = Number(
          currentMatch.winnerReward ?? 0
        );

        if (!Number.isFinite(newReward) || newReward <= 0) {
          throw new Error("INVALID_REWARD");
        }

        // Credit the new winner.
        if (winnerId === match.hostId) {
          hostBalance += newReward;
        } else if (winnerId === match.opponentId) {
          opponentBalance += newReward;
        } else {
          throw new Error("INVALID_WINNER");
        }

        /*
          -----------------------------------------------
          UPDATE HOST USER
          -----------------------------------------------
        */

        transaction.update(hostRef, {
          winningsBalance: hostBalance,

          tournamentStats: {
            ...hostStats,
            goals: hostGoals,
            conceded: hostConceded,
            wins: hostWins,
            losses: hostLosses,
            matches: hostMatches,
          },

          updatedAt: serverTimestamp(),
        });

        /*
          -----------------------------------------------
          UPDATE OPPONENT USER
          -----------------------------------------------
        */

        transaction.update(opponentRef, {
          winningsBalance: opponentBalance,

          tournamentStats: {
            ...opponentStats,
            goals: opponentGoals,
            conceded: opponentConceded,
            wins: opponentWins,
            losses: opponentLosses,
            matches: opponentMatches,
          },

          updatedAt: serverTimestamp(),
        });

        /*
          -----------------------------------------------
          UPDATE MATCH
          -----------------------------------------------
        */

        const finalHostName =
          String(hostData.username ?? "").trim() || match.hostName;

        const finalOpponentName =
          String(opponentData.username ?? "").trim() ||
          match.opponentName ||
          "Opponent";

        const finalWinnerName =
          winnerId === match.hostId
            ? finalHostName
            : finalOpponentName;

        transaction.update(matchRef, {
          hostScore,
          opponentScore,

          hostName: finalHostName,
          opponentName: finalOpponentName,

          winnerId,
          winnerName: finalWinnerName,

          status: "completed",

          rewardCredited: true,
          statsApplied: true,

          rewardCreditedAt: serverTimestamp(),
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      setMessage(
        `Result saved. ${winnerName} won ₹${match.winnerReward}. Player stats updated successfully.`
      );

      setScores((current) => ({
        ...current,
        [match.id]: {
          host: "",
          opponent: "",
        },
      }));
    } catch (err) {
      console.error("Result submission failed:", err);

      const errorMessage =
        err instanceof Error ? err.message : "";

      if (errorMessage === "MATCH_NOT_READY") {
        setError("This match is not ready for result submission.");
      } else if (errorMessage === "PLAYER_DETAILS_CHANGED") {
        setError("Player details changed. Refresh and try again.");
      } else if (errorMessage === "PLAYER_USER_NOT_FOUND") {
        setError("One of the player accounts was not found.");
      } else if (errorMessage === "INVALID_REWARD") {
        setError("Invalid reward amount.");
      } else if (errorMessage === "OLD_SCORE_NOT_FOUND") {
        setError("Previous match score was not found. Please check the match.");
      } else if (errorMessage === "OLD_WINNER_NOT_FOUND") {
        setError("Previous winner account could not be identified.");
      } else if (errorMessage === "INVALID_WINNER") {
        setError("Winner account is invalid.");
      } else {
        setError("Unable to submit result. Please check and try again.");
      }
    } finally {
      setBusyId("");
    }
  }

  /* =====================================================
     FILTER MATCHES
  ===================================================== */

  const requestedMatches = matches.filter(
    (match) => match.status === "pending_admin_approval"
  );

  const waitingMatches = matches.filter(
    (match) =>
      match.status === "waiting_for_opponent" &&
      match.adminApproved === true
  );

  const matchedMatches = matches.filter(
    (match) =>
      match.status === "matched" ||
      match.status === "room_code_added"
  );

  const completedMatches = matches.filter(
    (match) => match.status === "completed"
  );

  const otherMatches = matches.filter(
    (match) =>
      ![
        "pending_admin_approval",
        "waiting_for_opponent",
        "matched",
        "room_code_added",
        "completed",
      ].includes(match.status)
  );

  const manageMatches = matches.filter(
    (match) => match.status !== "pending_admin_approval"
  );

  /* =====================================================
     UPDATE DETAIL INPUT
  ===================================================== */

  function updateDetail(
    match: OneVsOneMatch,
    field: keyof DetailInput,
    value: string
  ) {
    setDetails((current) => ({
      ...current,
      [match.id]: {
        date: current[match.id]?.date ?? match.date,
        time: current[match.id]?.time ?? match.time,
        entryFee:
          current[match.id]?.entryFee ??
          String(match.entryFee),
        winnerReward:
          current[match.id]?.winnerReward ??
          String(match.winnerReward),
        roomCode:
          current[match.id]?.roomCode ??
          match.roomCode ??
          "",
        [field]: value,
      },
    }));
  }

  /* =====================================================
     MATCH CARD RENDERER

     Called as a normal function, not a nested React
     component. This prevents input focus from resetting
     when state changes.
  ===================================================== */

  function renderMatchCard(
    match: OneVsOneMatch,
    section: SectionType
  ) {
    const busy = busyId === match.id;
    const expanded = expandedId === match.id;

    const detail = details[match.id];

    const currentDate = detail?.date ?? match.date;
    const currentTime = detail?.time ?? match.time;

    const currentEntryFee =
      detail?.entryFee ?? String(match.entryFee);

    const currentReward =
      detail?.winnerReward ?? String(match.winnerReward);

    const currentRoomCode =
      detail?.roomCode ?? match.roomCode ?? "";

    const playerOne = match.hostName || "Player 1";
    const playerTwo =
      match.opponentName || "Waiting for player";

    return (
      <div
        key={match.id}
        className="overflow-hidden rounded-[17px] border border-[#e3e7ed] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.05)]"
      >
        {/* MATCH CARD HEADER */}

        <button
          type="button"
          onClick={() =>
            setExpandedId((current) =>
              current === match.id ? "" : match.id
            )
          }
          className="w-full text-left"
        >
          <div className="flex items-center justify-between border-b border-[#edf0f3] px-4 py-3">
            <div>
              <p className="text-[8px] font-black tracking-[0.15em] text-[#9aa3b1]">
                1V1 MATCH
              </p>

              <p className="mt-1 text-[10px] font-bold text-[#9aa3b1]">
                #{match.id.slice(0, 8)}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1.5 text-[8px] font-black uppercase ${
                match.status === "pending_admin_approval"
                  ? "bg-[#fff5df] text-[#b77912]"
                  : match.status === "waiting_for_opponent"
                  ? "bg-[#eaf3ff] text-[#0879d1]"
                  : match.status === "matched" ||
                    match.status === "room_code_added"
                  ? "bg-[#edf9f2] text-[#16834a]"
                  : match.status === "completed"
                  ? "bg-[#e9e8ff] text-[#5145b5]"
                  : "bg-[#f1f3f5] text-[#657084]"
              }`}
            >
              {match.status.replaceAll("_", " ")}
            </span>
          </div>

          {/* P1 VS P2 */}

          <div className="p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="min-w-0 rounded-[12px] bg-[#f5f7fa] p-3 text-center">
                <p className="text-[8px] font-black text-[#9aa3b1]">
                  P1
                </p>

                <p className="mt-2 break-words text-[12px] font-black text-[#071426]">
                  {playerOne}
                </p>

                {match.status === "completed" && (
                  <p className="mt-2 text-[20px] font-black text-[#071426]">
                    {match.hostScore ?? "—"}
                  </p>
                )}
              </div>

              <div className="text-center">
                <p className="text-[11px] font-black text-[#0879d1]">
                  VS
                </p>

                <span />
              </div>

              <div className="min-w-0 rounded-[12px] bg-[#f5f7fa] p-3 text-center">
                <p className="text-[8px] font-black text-[#9aa3b1]">
                  P2
                </p>

                <p className="mt-2 break-words text-[12px] font-black text-[#071426]">
                  {playerTwo}
                </p>

                {match.status === "completed" && (
                  <p className="mt-2 text-[20px] font-black text-[#071426]">
                    {match.opponentScore ?? "—"}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-[9px] font-bold text-[#8a94a4]">
                {match.date || "Date not set"} · {match.time || "Time not set"}
              </p>

              <p className="text-[9px] font-black text-[#0879d1]">
                {expanded ? "CLOSE ▲" : "VIEW DETAILS ▼"}
              </p>
            </div>
          </div>
        </button>

        {/* EXPANDED DETAILS */}

        {expanded && (
          <div className="border-t border-[#edf0f3] p-4">
            {/* MATCH DETAILS */}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[11px] bg-[#f6f8fa] p-3">
                <p className="text-[8px] font-bold text-[#9aa3b1]">
                  ENTRY FEE
                </p>

                <p className="mt-1 text-[16px] font-black text-[#071426]">
                  ₹{match.entryFee}
                </p>
              </div>

              <div className="rounded-[11px] bg-[#071426] p-3">
                <p className="text-[8px] font-bold text-white/50">
                  WINNER REWARD
                </p>

                <p className="mt-1 text-[16px] font-black text-[#FFD600]">
                  ₹{match.winnerReward}
                </p>
              </div>
            </div>

            {/* EDIT DETAILS */}

            {section !== "other" && (
              <div className="mt-4 rounded-[12px] border border-[#e3e7ed] p-3">
                <p className="text-[9px] font-black text-[#071426]">
                  EDIT MATCH DETAILS
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-bold text-[#657084]">
                      DATE
                    </label>

                    <input
                      type="date"
                      value={currentDate}
                      onChange={(event) =>
                        updateDetail(
                          match,
                          "date",
                          event.target.value
                        )
                      }
                      className="mt-1 h-[42px] w-full min-w-0 rounded-[9px] border border-[#dfe4ea] bg-white px-2 text-[10px] font-bold text-[#071426] outline-none focus:border-[#0879d1]"
                    />
                  </div>

                  <div>
                    <label className="text-[8px] font-bold text-[#657084]">
                      TIME
                    </label>

                    <input
                      type="time"
                      value={currentTime}
                      onChange={(event) =>
                        updateDetail(
                          match,
                          "time",
                          event.target.value
                        )
                      }
                      className="mt-1 h-[42px] w-full min-w-0 rounded-[9px] border border-[#dfe4ea] bg-white px-2 text-[10px] font-bold text-[#071426] outline-none focus:border-[#0879d1]"
                    />
                  </div>

                  <div>
                    <label className="text-[8px] font-bold text-[#657084]">
                      ENTRY FEE
                    </label>

                    <input
                      type="number"
                      min="0"
                      value={currentEntryFee}
                      onChange={(event) =>
                        updateDetail(
                          match,
                          "entryFee",
                          event.target.value
                        )
                      }
                      className="mt-1 h-[42px] w-full min-w-0 rounded-[9px] border border-[#dfe4ea] px-3 text-[11px] font-bold text-[#071426] outline-none focus:border-[#0879d1]"
                    />
                  </div>

                  <div>
                    <label className="text-[8px] font-bold text-[#657084]">
                      WINNER REWARD
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={currentReward}
                      onChange={(event) =>
                        updateDetail(
                          match,
                          "winnerReward",
                          event.target.value
                        )
                      }
                      className="mt-1 h-[42px] w-full min-w-0 rounded-[9px] border border-[#dfe4ea] px-3 text-[11px] font-bold text-[#071426] outline-none focus:border-[#0879d1]"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => saveMatchDetails(match)}
                  className="mt-3 w-full rounded-[10px] bg-[#071426] py-3 text-[9px] font-black text-white disabled:opacity-50"
                >
                  {busy ? "SAVING..." : "SAVE MATCH DETAILS"}
                </button>
              </div>
            )}

            {/* ROOM CODE */}

            {(section === "matched" ||
              section === "completed") && (
              <div className="mt-4 rounded-[12px] border border-[#e3e7ed] p-3">
                <p className="text-[9px] font-black text-[#071426]">
                  ROOM CODE
                </p>

                <input
                  type="text"
                  value={currentRoomCode}
                  onChange={(event) =>
                    updateDetail(
                      match,
                      "roomCode",
                      event.target.value
                    )
                  }
                  placeholder="Enter eFootball room code"
                  className="mt-2 h-[43px] w-full rounded-[10px] border border-[#dfe4ea] bg-white px-3 text-[12px] font-bold text-[#071426] outline-none focus:border-[#0879d1]"
                />

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => addRoomCode(match)}
                  className="mt-2 w-full rounded-[10px] bg-[#0879d1] py-3 text-[9px] font-black text-white disabled:opacity-50"
                >
                  {busy ? "SAVING..." : "SAVE ROOM CODE"}
                </button>
              </div>
            )}

            {/* WAITING */}

            {section === "waiting" && (
              <div className="mt-4 rounded-[11px] border border-[#d8e8fa] bg-[#f1f7ff] p-3">
                <p className="text-[10px] font-black text-[#0879d1]">
                  WAITING FOR OPPONENT
                </p>

                <p className="mt-1 text-[9px] leading-4 text-[#657084]">
                  This match is approved and available for players to join.
                </p>
              </div>
            )}

            {/* MATCHED / COMPLETED SCORE FORM */}

            {(section === "matched" ||
              section === "completed") && (
              <div className="mt-4 rounded-[13px] border border-[#e3e7ed] p-3">
                <p className="text-[9px] font-black text-[#071426]">
                  {section === "completed"
                    ? "EDIT MATCH RESULT"
                    : "SUBMIT MATCH RESULT"}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block break-words text-[9px] font-bold text-[#657084]">
                      {playerOne} SCORE
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={
                        scores[match.id]?.host ??
                        (match.hostScore !== null &&
                        match.hostScore !== undefined
                          ? String(match.hostScore)
                          : "")
                      }
                      onChange={(event) =>
                        setScores((current) => ({
                          ...current,
                          [match.id]: {
                            host: event.target.value,
                            opponent:
                              current[match.id]?.opponent ??
                              (match.opponentScore !== null &&
                              match.opponentScore !== undefined
                                ? String(match.opponentScore)
                                : ""),
                          },
                        }))
                      }
                      placeholder="0"
                      className="mt-2 h-[45px] w-full min-w-0 rounded-[10px] border border-[#dfe4ea] px-2 text-center text-[17px] font-black text-[#071426] outline-none focus:border-[#0879d1]"
                    />
                  </div>

                  <div>
                    <label className="block break-words text-[9px] font-bold text-[#657084]">
                      {playerTwo} SCORE
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={
                        scores[match.id]?.opponent ??
                        (match.opponentScore !== null &&
                        match.opponentScore !== undefined
                          ? String(match.opponentScore)
                          : "")
                      }
                      onChange={(event) =>
                        setScores((current) => ({
                          ...current,
                          [match.id]: {
                            host:
                              current[match.id]?.host ??
                              (match.hostScore !== null &&
                              match.hostScore !== undefined
                                ? String(match.hostScore)
                                : ""),
                            opponent: event.target.value,
                          },
                        }))
                      }
                      placeholder="0"
                      className="mt-2 h-[45px] w-full min-w-0 rounded-[10px] border border-[#dfe4ea] px-2 text-center text-[17px] font-black text-[#071426] outline-none focus:border-[#0879d1]"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submitResult(match)}
                  className="mt-3 w-full rounded-[10px] bg-[#16a34a] py-3 text-[9px] font-black text-white disabled:opacity-50"
                >
                  {busy
                    ? "PROCESSING..."
                    : section === "completed"
                    ? "UPDATE SCORE & PLAYER STATS"
                    : "SUBMIT RESULT & CREDIT REWARD"}
                </button>

                <p className="mt-2 text-[8px] leading-4 text-[#8993a2]">
                  Editing a completed result will reverse the old stats
                  and reward before applying the new result.
                </p>
              </div>
            )}

            {/* COMPLETED RESULT */}

            {section === "completed" && (
              <div className="mt-4 rounded-[11px] bg-[#f6f8fa] p-3">
                <p className="text-[8px] font-bold text-[#9aa3b1]">
                  CURRENT WINNER
                </p>

                <p className="mt-1 text-[12px] font-black text-[#16834a]">
                  {match.winnerName ||
                    (match.winnerId === match.hostId
                      ? match.hostName
                      : match.opponentName)}
                </p>

                <p className="mt-2 text-[9px] font-bold text-[#657084]">
                  {match.rewardCredited
                    ? `₹${match.winnerReward} reward credited`
                    : "Reward not marked as credited"}
                </p>
              </div>
            )}

            {/* REJECTED / OTHER */}

            {section === "other" && (
              <div className="mt-3 rounded-[11px] bg-[#f6f8fa] p-3">
                <p className="text-[9px] font-bold text-[#657084]">
                  MATCH STATUS: {match.status.replaceAll("_", " ")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* =====================================================
     SECTION RENDERER
  ===================================================== */

  function renderSection(
    title: string,
    description: string,
    items: OneVsOneMatch[],
    section: SectionType,
    emptyText: string
  ) {
    return (
      <section key={title} className="mt-7">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-[15px] font-black text-[#071426]">
              {title}
            </h2>

            <p className="mt-1 text-[9px] font-medium text-[#8a94a4]">
              {description}
            </p>
          </div>

          <span className="rounded-full bg-[#e9edf2] px-3 py-1.5 text-[10px] font-black text-[#071426]">
            {items.length}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[15px] border border-dashed border-[#d8dee6] bg-white p-6 text-center">
            <p className="text-[10px] font-bold text-[#8a94a4]">
              {emptyText}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((match) =>
              renderMatchCard(match, section)
            )}
          </div>
        )}
      </section>
    );
  }

  /* =====================================================
     LOADING
  ===================================================== */

  if (checkingAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f9]">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[#dce2e9] border-t-[#0879d1]" />

          <p className="mt-3 text-sm font-bold text-[#647084]">
            Checking admin access...
          </p>
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  /* =====================================================
     MAIN UI
  ===================================================== */

  return (
    <main className="min-h-screen bg-[#f4f6f9]">
      <div className="mx-auto min-h-screen max-w-md bg-[#f8f9fb]">

        {/* HEADER */}

        <header className="sticky top-0 z-50 border-b border-[#e5e8ed] bg-white">
          <div className="flex h-[65px] items-center justify-between px-4">
            <div>
              <p className="text-[8px] font-black tracking-[0.25em] text-[#0879d1]">
                TOURNEX ADMIN
              </p>

              <h1 className="mt-1 text-[18px] font-black tracking-[-0.04em] text-[#071426]">
                1V1 Match Manager
              </h1>
            </div>

            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="rounded-[10px] border border-[#e0e5eb] bg-white px-3 py-2 text-[9px] font-extrabold text-[#566173]"
            >
              BACK
            </button>
          </div>
        </header>

        <div className="px-4 pb-12">

          {/* SUMMARY */}

          <section className="pt-5">
            <div className="rounded-[17px] bg-[#071426] p-4 text-white">
              <p className="text-[8px] font-black tracking-[0.2em] text-[#FFD600]">
                MATCH OVERVIEW
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-bold text-white/50">
                    TOTAL MATCHES
                  </p>

                  <p className="mt-1 text-[24px] font-black">
                    {matches.length}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] font-bold text-white/50">
                    REQUESTED
                  </p>

                  <p className="mt-1 text-[24px] font-black text-[#FFD600]">
                    {requestedMatches.length}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
                <div>
                  <p className="text-[8px] font-bold text-white/50">
                    WAITING
                  </p>

                  <p className="mt-1 text-[15px] font-black">
                    {waitingMatches.length}
                  </p>
                </div>

                <div>
                  <p className="text-[8px] font-bold text-white/50">
                    MATCHED
                  </p>

                  <p className="mt-1 text-[15px] font-black">
                    {matchedMatches.length}
                  </p>
                </div>

                <div>
                  <p className="text-[8px] font-bold text-white/50">
                    COMPLETED
                  </p>

                  <p className="mt-1 text-[15px] font-black">
                    {completedMatches.length}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* MESSAGES */}

          {message && (
            <div className="mt-4 rounded-[11px] bg-[#edf9f2] px-3 py-3">
              <p className="text-[10px] font-bold text-[#16834a]">
                {message}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-[11px] bg-[#fff1f1] px-3 py-3">
              <p className="text-[10px] font-bold text-[#d33b3b]">
                {error}
              </p>
            </div>
          )}

          {/* TWO TABS */}

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-[13px] bg-[#e9edf2] p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab("requested");
                setExpandedId("");
              }}
              className={`rounded-[10px] py-3 text-[10px] font-black transition ${
                activeTab === "requested"
                  ? "bg-[#071426] text-[#FFD600] shadow-sm"
                  : "text-[#657084]"
              }`}
            >
              REQUESTED
              <span className="ml-2 rounded-full bg-white/15 px-2 py-1">
                {requestedMatches.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("manage");
                setExpandedId("");
              }}
              className={`rounded-[10px] py-3 text-[10px] font-black transition ${
                activeTab === "manage"
                  ? "bg-[#071426] text-[#FFD600] shadow-sm"
                  : "text-[#657084]"
              }`}
            >
              MANAGE
              <span className="ml-2 rounded-full bg-white/15 px-2 py-1">
                {manageMatches.length}
              </span>
            </button>
          </div>

          {/* LOADING */}

          {loadingMatches ? (
            <div className="mt-8 rounded-[16px] border border-[#e3e7ed] bg-white p-7 text-center">
              <div className="mx-auto h-7 w-7 animate-spin rounded-full border-[2px] border-[#dce2e9] border-t-[#0879d1]" />

              <p className="mt-3 text-[10px] font-bold text-[#8a94a4]">
                Loading 1v1 matches...
              </p>
            </div>
          ) : (
            <>
              {/* REQUESTED TAB */}

              {activeTab === "requested" && (
                <>
                  {renderSection(
                    "New Match Requests",
                    "Accept or reject new 1v1 match requests.",
                    requestedMatches,
                    "other",
                    "No new match requests."
                  )}
                </>
              )}

              {/* MANAGE TAB */}

              {activeTab === "manage" && (
                <>
                  {renderSection(
                    "Waiting for Opponent",
                    "Approved matches available for players to join.",
                    waitingMatches,
                    "waiting",
                    "No matches waiting for an opponent."
                  )}

                  {renderSection(
                    "Matched Players",
                    "Add room code and submit match results.",
                    matchedMatches,
                    "matched",
                    "No matches with two players yet."
                  )}

                  {renderSection(
                    "Completed Matches",
                    "Edit scores, update stats and check reward status.",
                    completedMatches,
                    "completed",
                    "No completed matches yet."
                  )}

                  {renderSection(
                    "Other Matches",
                    "Rejected or other match statuses.",
                    otherMatches,
                    "other",
                    "No other matches."
                  )}
                </>
              )}
            </>
          )}

          {/* REFRESH */}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-7 w-full rounded-[12px] border border-[#dfe4ea] bg-white py-3 text-[9px] font-black text-[#566173]"
          >
            REFRESH PAGE
          </button>
        </div>
      </div>
    </main>
  );
}