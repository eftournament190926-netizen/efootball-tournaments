"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type TournamentType = "coin" | "money";

type Registration = {
  id: string;
  userId?: string;
  uid?: string;
  tournamentId: string;
  tournamentPoints?: number;
  category?: string | number;
  date?: string;
  time?: string;
  entryFee?: number;
  rewardCoins?: number;
  status?: string;
  createdAt?: {
    seconds?: number;
  };
  tournamentType: TournamentType;
};

type OneVsOneMatch = {
  id: string;
  type?: string;
  hostId: string;
  hostName?: string;
  hostEmail?: string;
  opponentId?: string;
  opponentName?: string;
  opponentEmail?: string;
  date: string;
  time: string;
  entryFee?: number;
  winnerReward?: number;
  status: string;
  adminApproved?: boolean;
  roomCode?: string;
  hostScore?: number;
  opponentScore?: number;
  winnerId?: string;
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
  tournamentType: TournamentType;
  points: number;
  image: string;
  description: string;
  date: string;
  time: string;
  category: string;
  players: number;
  entryFee: number;
  rewardCoins: number;
  cashPrize: number;
  status: string;
  registeredPlayers: number;
  maxPlayers: number;
  scores: Record<string, SavedScore>;
  matchPlayers: Record<string, SavedMatchPlayers>;
  createdAtSeconds: number;
  firstPrize?: number;
secondPrize?: number;
};

function getTournamentImage(points: number) {
  return `/images/${points}.png`;
}

function getMoneyTournamentImage(bannerType: number) {
  return `/images/money/${bannerType}.png`;
}

function formatDate(dateString: string) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(time: string) {
  if (!time) return "";

  const value = time.trim();

  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return value;

  const hour = Number(match[1]);
  const minute = match[2];

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function convertTimeTo24Hour(time: string) {
  if (!time) return "";

  const value = time.trim();

  const match = value.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i
  );

  if (!match) return value;

  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const period = match[3].toUpperCase();

  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function getCountdown(date: string, time: string) {
  if (!date || !time) return "";

  const tournamentDate = new Date(
    `${date}T${convertTimeTo24Hour(time)}:00+05:30`
  );

  if (Number.isNaN(tournamentDate.getTime())) {
    return "";
  }

  const difference = tournamentDate.getTime() - Date.now();

  if (difference <= 0) return "Started";

  const totalMinutes = Math.floor(difference / 60000);
  const days = Math.floor(totalMinutes / 1440);

  if (days === 0) {
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) return `${hours} Hours`;

    return `${Math.max(totalMinutes, 1)} Min`;
  }

  if (days === 1) return "Tomorrow";

  return `${days} Days`;
}

function canShowRoomCode(date: string, time: string) {
  if (!date || !time) return false;

  const matchDate = new Date(
    `${date}T${convertTimeTo24Hour(time)}:00+05:30`
  );

  if (Number.isNaN(matchDate.getTime())) return false;

  const releaseTime = matchDate.getTime() - 15 * 60 * 1000;

  return Date.now() >= releaseTime;
}

function isTournamentPlayed(
  tournament: Tournament,
  userId: string
) {
  const { scores, matchPlayers } = tournament;

  for (const matchId of Object.keys(matchPlayers || {})) {
    const match = matchPlayers[matchId];

    const score =
      scores?.[matchId] ||
      scores?.[`match${matchId}`];

    if (!match || !score) continue;

    if (
      match.player1Id === userId ||
      match.player2Id === userId
    ) {
      return true;
    }
  }

  return false;
}

function getOneVsOneStatus(status: string) {
  switch (status) {
    case "pending_admin_approval":
      return {
        label: "Waiting for Admin Approval",
        color: "bg-orange-100 text-orange-700",
      };

    case "waiting_for_opponent":
      return {
        label: "Waiting for Opponent",
        color: "bg-blue-100 text-blue-700",
      };

    case "matched":
      return {
        label: "Match Confirmed",
        color: "bg-green-100 text-green-700",
      };

    case "completed":
      return {
        label: "Completed",
        color: "bg-[#111111] text-[#FFD600]",
      };

    case "rejected":
      return {
        label: "Rejected",
        color: "bg-red-100 text-red-700",
      };

    case "cancelled":
      return {
        label: "Cancelled",
        color: "bg-gray-200 text-gray-700",
      };

    default:
      return {
        label: status || "Pending",
        color: "bg-gray-100 text-gray-700",
      };
  }
}

function BottomNavigation() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#222222] bg-[#111111]">
      <div className="mx-auto grid h-[72px] max-w-md grid-cols-5">
        <BottomNavItem
          icon="🏆"
          label="Tournaments"
          onClick={() => router.push("/")}
        />

        <BottomNavItem
          icon="🎮"
          label={
            <>
              My
              <br />
              Tournaments
            </>
          }
          active
          onClick={() => router.push("/my-tournaments")}
        />

        <BottomNavItem
          icon="⚡"
          label={
            <>
              Division
              <br />
              League
            </>
          }
          onClick={() => router.push("/division")}
        />

        <BottomNavItem
          icon="🏅"
          label={
            <>
              Leader
              <br />
              Board
            </>
          }
          onClick={() => router.push("/leaderboard")}
        />

        <BottomNavItem
          icon="👤"
          label="Profile"
          onClick={() => router.push("/profile")}
        />
      </div>
    </nav>
  );
}

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
        active ? "text-[#FFD600]" : "text-[#777777]"
      }`}
    >
      <span
        className={`flex h-[23px] items-center justify-center text-[19px] leading-none ${
          active ? "" : "grayscale opacity-35"
        }`}
      >
        {icon}
      </span>

      <span
        className={`text-[8px] leading-[10px] ${
          active
            ? "font-black text-[#FFD600]"
            : "font-bold text-[#777777] opacity-70"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function TournamentCard({
  tournament,
  userId,
  onOpen,
}: {
  tournament: Tournament;
  userId: string;
  onOpen: () => void;
}) {
  const isMoney = tournament.tournamentType === "money";

  const registered = Number(
    tournament.registeredPlayers || 0
  );

  const maxPlayers = Number(
    tournament.maxPlayers || tournament.players || 0
  );

  const percentage =
    maxPlayers > 0
      ? Math.min((registered / maxPlayers) * 100, 100)
      : 0;

  const played = isTournamentPlayed(tournament, userId);

    const isFourPlayerMoney =
    isMoney && maxPlayers === 4;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full max-w-[400px] overflow-hidden rounded-[20px] border border-[#d9d9d9] bg-white text-left shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition active:scale-[0.99]"
    >
            {isFourPlayerMoney ? (
        /* 4 PLAYER CUSTOM BANNER */
        <div className="relative w-full overflow-hidden bg-gradient-to-br from-[#171717] via-[#292000] to-[#111111] px-5 py-6">

          {/* BACKGROUND DECORATION */}
          <div className="pointer-events-none absolute -right-5 -top-12 text-[180px] font-black leading-none text-white/[0.04]">
            4
          </div>

          <div className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full border-[18px] border-[#FFD600]/10" />

          {/* HEADER */}
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FFD600]">
                TOURNEX
              </p>

              <h2 className="mt-1 text-[24px] font-black italic leading-none text-white">
                4 PLAYER
              </h2>

              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
                CASH TOURNAMENT
              </p>
            </div>

            <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-[3px] border-[#FFD600] bg-[#FFD600]/10">
              <span className="text-[35px] font-black text-[#FFD600]">
                4
              </span>
            </div>
          </div>

          {/* FOUR PLAYERS */}
          <div className="relative mt-6 flex items-center justify-center gap-4">
            {[1, 2, 3, 4].map((player) => (
              <div
                key={player}
                className="flex h-[43px] w-[43px] items-center justify-center rounded-full border-2 border-[#FFD600] bg-[#292929] shadow-lg"
              >
                <span className="text-[21px]">👤</span>
              </div>
            ))}
          </div>

          {/* PRIZES */}
          <div className="relative mt-6 grid grid-cols-2 gap-3">

            <div className="rounded-[12px] border border-[#FFD600]/30 bg-black/40 px-3 py-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#FFD600]">
                🏆 First Prize
              </p>

              <p className="mt-1 text-[23px] font-black text-white">
                ₹{tournament.firstPrize ?? 0}
              </p>
            </div>

            <div className="rounded-[12px] border border-white/15 bg-black/40 px-3 py-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/60">
                Second Prize
              </p>

              <p className="mt-1 text-[23px] font-black text-white">
                ₹{tournament.secondPrize ?? 0}
              </p>
            </div>

          </div>

        </div>
      ) : (
        /* EXISTING IMAGE BANNER - COIN / 8 / 16 PLAYERS */
        <div className="relative w-full overflow-hidden bg-white">
          <img
            src={tournament.image}
            alt={isMoney ? "Money Tournament" : "Coin Tournament"}
            className="block h-auto w-full"
          />

          <div className="absolute left-3 top-3 rounded-full bg-[#111111] px-3 py-[6px] text-[9px] font-black uppercase tracking-[0.08em] text-[#FFD600]">
            {isMoney ? "Cash Tournament" : "eFootball"}
          </div>
        </div>
      )}

      <div className="px-5 pb-5 pt-4">
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <div>
            <p className="text-[19px] font-black leading-none text-[#111111]">
              {formatDate(tournament.date)}
            </p>

            <p className="mt-3 text-[17px] font-bold text-[#111111]">
              {formatTime(tournament.time)}
            </p>
          </div>

          <div className="rounded-[12px] bg-[#FFF6C7] px-3 py-2 text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#777777]">
              Starts In
            </p>

            <p className="mt-1 whitespace-nowrap text-[15px] font-black text-[#111111]">
              {getCountdown(tournament.date, tournament.time)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-[#eeeeee] bg-[#fafafa]">
          <div className="p-3">
            <p className="text-[10px] font-bold text-[#8b939a]">
              Entry Fee
            </p>

            <p className="mt-1 text-[17px] font-black text-[#111111]">
              {isMoney
                ? `${tournament.entryFee} Points`
                : `₹${tournament.entryFee}`}
            </p>
          </div>

          <div className="border-l border-[#e1e1e1] p-3">
            <p className="text-[10px] font-bold text-[#8b939a]">
              {isMoney ? "Cash Prize" : "Prize Pool"}
            </p>

            <p className="mt-1 text-[17px] font-black text-[#111111]">
              {isMoney
                ? `₹${tournament.cashPrize}`
                : `${tournament.rewardCoins} coin`}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.08em] text-[#777777]">
              Players
            </span>

            <span className="text-[11px] font-black text-[#111111]">
              {registered}/{maxPlayers}
            </span>
          </div>

          <div className="h-[7px] w-full overflow-hidden rounded-full bg-[#e3e3e3]">
            <div
              className="h-full rounded-full bg-[#FFD600]"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {played && (
          <div className="mt-4">
            <span className="inline-flex rounded-full bg-[#111111] px-3 py-[6px] text-[9px] font-black uppercase tracking-[0.08em] text-[#FFD600]">
              Played
            </span>
          </div>
        )}
      </div>
    </button>
  );
}


function OneVsOneMatchCard({
  match,
  userId,
  usernames,
  profilePhotos,
}: {
  match: OneVsOneMatch;
  userId: string;
  usernames: Record<string, string>;
  profilePhotos: Record<string, string>;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const statusInfo = getOneVsOneStatus(match.status);

  const isHost = match.hostId === userId;

  const hostUsername =
    usernames[match.hostId] ||
    match.hostName ||
    "Player";

  const opponentUsername = match.opponentId
    ? usernames[match.opponentId] ||
      match.opponentName ||
      "Player"
    : "Waiting for player";

  const hasResult = match.status === "completed";

  const isWinner = match.winnerId === userId;

  return (
    <div className="w-full max-w-[400px] overflow-hidden rounded-[20px] border border-[#dedede] bg-white shadow-[0_4px_14px_rgba(0,0,0,0.07)]">

      {/* SIMPLE MATCH CARD */}
      <div className="px-5 py-5">

        {/* HEADER */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#999999]">
              eFootball 1v1
            </p>

            <p className="mt-1 text-[13px] font-black text-[#111111]">
              Match #{match.id.slice(0, 6).toUpperCase()}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-2 text-center text-[9px] font-black ${statusInfo.color}`}
          >
            {statusInfo.label}
          </span>
        </div>

        {/* PLAYER VS SCORE */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">

          {/* P1 HOST */}
          <div className="min-w-0 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-[2px] border-[#FFD600] bg-[#111111]">
              {profilePhotos[match.hostId] ? (
                <img
                  src={profilePhotos[match.hostId]}
                  alt={hostUsername}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl">👤</span>
              )}
            </div>

            <p className="mt-2 truncate text-[13px] font-black text-[#111111]">
              {hostUsername}
            </p>

            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#999999]">
              P1 · Host
            </p>
          </div>

          {/* VS / SCORE */}
          <div className="flex min-w-[75px] items-center justify-center">
            {hasResult ? (
              <div className="rounded-[10px] bg-[#111111] px-3 py-2">
                <p className="text-[18px] font-black text-[#FFD600]">
                  {match.hostScore ?? 0} - {match.opponentScore ?? 0}
                </p>
              </div>
            ) : (
              <span className="text-[16px] font-black italic text-[#FFD600]">
                VS
              </span>
            )}
          </div>

          {/* P2 OPPONENT */}
          <div className="min-w-0 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-[2px] border-[#FFD600] bg-[#111111]">
              {match.opponentId && profilePhotos[match.opponentId] ? (
                <img
                  src={profilePhotos[match.opponentId]}
                  alt={opponentUsername}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl">👤</span>
              )}
            </div>

            <p className="mt-2 truncate text-[13px] font-black text-[#111111]">
              {opponentUsername}
            </p>

            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#999999]">
              P2 · Opponent
            </p>
          </div>

        </div>

        {/* VIEW DETAILS BUTTON */}
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#111111] py-3 text-[12px] font-black text-[#FFD600] transition active:scale-[0.98]"
        >
          {showDetails ? "Hide Details" : "View Details"}

          <span className="text-[14px]">
            {showDetails ? "⌃" : "⌄"}
          </span>
        </button>
      </div>

      {/* FULL MATCH DETAILS */}
      {showDetails && (
        <div className="border-t border-[#eeeeee] px-4 py-5">

          {/* DATE & TIME */}
          <div className="grid grid-cols-2 gap-2">

            <div className="rounded-[12px] bg-[#f7f7f7] p-3">
              <p className="text-[9px] font-bold uppercase text-[#999999]">
                Match Date
              </p>

              <p className="mt-1 text-[13px] font-black text-[#111111]">
                {formatDate(match.date)}
              </p>
            </div>

            <div className="rounded-[12px] bg-[#f7f7f7] p-3">
              <p className="text-[9px] font-bold uppercase text-[#999999]">
                Match Time
              </p>

              <p className="mt-1 text-[13px] font-black text-[#111111]">
                {formatTime(match.time)}
              </p>
            </div>

            <div className="rounded-[12px] bg-[#f7f7f7] p-3">
              <p className="text-[9px] font-bold uppercase text-[#999999]">
                Entry Fee
              </p>

              <p className="mt-1 text-[14px] font-black text-[#111111]">
                ₹{Number(match.entryFee || 0)}
              </p>
            </div>

            <div className="rounded-[12px] bg-[#fff8d7] p-3">
              <p className="text-[9px] font-bold uppercase text-[#999999]">
                Winner Reward
              </p>

              <p className="mt-1 text-[14px] font-black text-[#111111]">
                ₹{Number(match.winnerReward || 0)}
              </p>
            </div>

          </div>

          {/* ADMIN APPROVAL */}
          {match.status === "pending_admin_approval" && (
            <div className="mt-4 rounded-[12px] border border-orange-200 bg-orange-50 px-4 py-3">
              <p className="text-[11px] font-bold leading-5 text-orange-700">
                Your match request is waiting for admin approval.
              </p>
            </div>
          )}

          {/* WAITING FOR OPPONENT */}
          {match.status === "waiting_for_opponent" && (
            <div className="mt-4 rounded-[12px] border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-[11px] font-bold leading-5 text-blue-700">
                {isHost
                  ? "Your match is approved. Waiting for another player to join."
                  : "Waiting for another player to join this match."}
              </p>
            </div>
          )}

          {/* ROOM CODE */}
          {match.roomCode?.trim() ? (
            <div className="mt-4 rounded-[14px] border border-green-200 bg-green-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-green-700">
                Room Code
              </p>

              <p className="mt-2 break-all text-[23px] font-black tracking-[0.12em] text-[#111111]">
                {match.roomCode}
              </p>

              <p className="mt-2 text-[10px] font-medium leading-4 text-green-700">
                Use this room code to join the match.
              </p>
            </div>
          ) : match.status === "matched" ? (
            <div className="mt-4 rounded-[12px] border border-[#eeeeee] bg-[#f7f7f7] px-4 py-3">
              <p className="text-[11px] font-bold leading-5 text-[#777777]">
                Room code has not been shared yet.
              </p>
            </div>
          ) : null}

          {/* MATCH RESULT */}
          {hasResult && (
            <div
              className={`mt-4 rounded-[12px] p-4 ${
                isWinner
                  ? "border border-green-200 bg-green-50"
                  : "border border-[#eeeeee] bg-[#f7f7f7]"
              }`}
            >
              <p
                className={`text-center text-[14px] font-black ${
                  isWinner ? "text-green-700" : "text-[#111111]"
                }`}
              >
                {isWinner
                  ? "🏆 You Won!"
                  : match.winnerId
                  ? "Match Completed"
                  : "Match Draw"}
              </p>

              {match.winnerId && !isWinner && (
                <p className="mt-1 text-center text-[11px] font-bold text-[#777777]">
                  Winner:{" "}
                  {match.winnerId === match.hostId
                    ? hostUsername
                    : opponentUsername}
                </p>
              )}
            </div>
          )}

          {/* REJECTED */}
          {match.status === "rejected" && (
            <div className="mt-4 rounded-[12px] bg-red-50 px-4 py-3">
              <p className="text-[11px] font-bold text-red-700">
                This match request was rejected by admin.
              </p>
            </div>
          )}

          {/* CANCELLED */}
          {match.status === "cancelled" && (
            <div className="mt-4 rounded-[12px] bg-gray-100 px-4 py-3">
              <p className="text-[11px] font-bold text-gray-600">
                This match has been cancelled.
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}


export default function MyTournamentsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [coinRegistrations, setCoinRegistrations] =
    useState<Registration[]>([]);

  const [moneyRegistrations, setMoneyRegistrations] =
    useState<Registration[]>([]);

  const [coinLoaded, setCoinLoaded] = useState(false);
  const [moneyLoaded, setMoneyLoaded] = useState(false);

  const [tournaments, setTournaments] =
    useState<Tournament[]>([]);

  const [loadingDetails, setLoadingDetails] = useState(true);

  const [activeTab, setActiveTab] = useState<
    "upcoming" | "played" | "onevone"
  >("upcoming");

  const [oneVsOneMatches, setOneVsOneMatches] =
    useState<OneVsOneMatch[]>([]);

  const [oneVsOneLoaded, setOneVsOneLoaded] =
    useState(false);

  const [usernames, setUsernames] =
  useState<Record<string, string>>({});

const [profilePhotos, setProfilePhotos] =
  useState<Record<string, string>>({});

  // AUTH LISTENER
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUserId(null);
        setAuthLoading(false);
        router.push("/login?redirect=/my-tournaments");
        return;
      }

      setUserId(user.uid);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // COIN AND MONEY REGISTRATIONS
  useEffect(() => {
    if (!userId) return;

    setCoinLoaded(false);
    setMoneyLoaded(false);

    const coinQuery = query(
      collection(db, "tournamentRegistrations"),
      where("userId", "==", userId)
    );

    const moneyQuery = query(
      collection(db, "moneyTournamentRegistrations"),
      where("userId", "==", userId)
    );

    const unsubscribeCoin = onSnapshot(
      coinQuery,
      (snapshot) => {
        const registrations: Registration[] =
          snapshot.docs
            .map((item): Registration => ({
              ...(item.data() as Omit<
                Registration,
                "id" | "tournamentType"
              >),
              id: item.id,
              tournamentType: "coin",
            }))
            .filter((item) => item.status === "confirmed");

        setCoinRegistrations(registrations);
        setCoinLoaded(true);
      },
      (error) => {
        console.error("Coin registration error:", error);
        setCoinRegistrations([]);
        setCoinLoaded(true);
      }
    );

    const unsubscribeMoney = onSnapshot(
      moneyQuery,
      (snapshot) => {
        const registrations: Registration[] =
          snapshot.docs
            .map((item): Registration => ({
              ...(item.data() as Omit<
                Registration,
                "id" | "tournamentType"
              >),
              id: item.id,
              tournamentType: "money",
            }))
            .filter((item) => item.status === "confirmed");

        setMoneyRegistrations(registrations);
        setMoneyLoaded(true);
      },
      (error) => {
        console.error("Money registration error:", error);
        setMoneyRegistrations([]);
        setMoneyLoaded(true);
      }
    );

    return () => {
      unsubscribeCoin();
      unsubscribeMoney();
    };
  }, [userId]);

  // 1V1 MATCHES LISTENER
  useEffect(() => {
    if (!userId) return;

    setOneVsOneLoaded(false);

    const matchesRef = collection(db, "oneVsOneMatches");

    const hostMatches = new Map<string, OneVsOneMatch>();
    const opponentMatches = new Map<string, OneVsOneMatch>();

    let hostLoaded = false;
    let opponentLoaded = false;

    function publishMatches() {
      const combined = new Map<string, OneVsOneMatch>();

      hostMatches.forEach((match, id) => {
        combined.set(id, match);
      });

      opponentMatches.forEach((match, id) => {
        combined.set(id, match);
      });

      const matches = Array.from(combined.values()).sort(
        (a, b) => {
          const dateA = new Date(
            `${a.date}T${convertTimeTo24Hour(a.time)}:00+05:30`
          ).getTime();

          const dateB = new Date(
            `${b.date}T${convertTimeTo24Hour(b.time)}:00+05:30`
          ).getTime();

          if (
            Number.isNaN(dateA) ||
            Number.isNaN(dateB)
          ) {
            return 0;
          }

          return dateA - dateB;
        }
      );

      setOneVsOneMatches(matches);

      if (hostLoaded && opponentLoaded) {
        setOneVsOneLoaded(true);
      }
    }

    const hostQuery = query(
      matchesRef,
      where("hostId", "==", userId)
    );

    const opponentQuery = query(
      matchesRef,
      where("opponentId", "==", userId)
    );

    const unsubscribeHost = onSnapshot(
      hostQuery,
      (snapshot) => {
        hostMatches.clear();

        snapshot.docs.forEach((item) => {
          hostMatches.set(item.id, {
            ...(item.data() as Omit<
              OneVsOneMatch,
              "id"
            >),
            id: item.id,
          });
        });

        hostLoaded = true;
        publishMatches();
      },
      (error) => {
        console.error("Host matches error:", error);
        hostLoaded = true;
        publishMatches();
      }
    );

    const unsubscribeOpponent = onSnapshot(
      opponentQuery,
      (snapshot) => {
        opponentMatches.clear();

        snapshot.docs.forEach((item) => {
          opponentMatches.set(item.id, {
            ...(item.data() as Omit<
              OneVsOneMatch,
              "id"
            >),
            id: item.id,
          });
        });

        opponentLoaded = true;
        publishMatches();
      },
      (error) => {
        console.error("Opponent matches error:", error);
        opponentLoaded = true;
        publishMatches();
      }
    );

    return () => {
      unsubscribeHost();
      unsubscribeOpponent();
    };
  }, [userId]);

  // LOAD PLAYER USERNAMES
  useEffect(() => {
  if (oneVsOneMatches.length === 0) {
    setUsernames({});
    setProfilePhotos({});
    return;
  }

  let cancelled = false;

  async function loadPlayers() {
    const ids = Array.from(
      new Set(
        oneVsOneMatches.flatMap((match) =>
          [match.hostId, match.opponentId].filter(
            (id): id is string => Boolean(id)
          )
        )
      )
    );

    const names: Record<string, string> = {};
    const photos: Record<string, string> = {};

    await Promise.all(
      ids.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, "users", uid));

          if (snap.exists()) {
            const data = snap.data();

            names[uid] = String(
              data.username || "Player"
            );

            photos[uid] = String(
              data.profilePhoto || ""
            );
          }
        } catch (error) {
          console.error("Player loading error:", error);
        }
      })
    );

    if (!cancelled) {
      setUsernames(names);
      setProfilePhotos(photos);
    }
  }

  loadPlayers();

  return () => {
    cancelled = true;
  };
}, [oneVsOneMatches]);

  // COMBINE REGISTRATIONS
  const allRegistrations = useMemo(
    () => [...coinRegistrations, ...moneyRegistrations],
    [coinRegistrations, moneyRegistrations]
  );

  // LOAD TOURNAMENT DETAILS
  useEffect(() => {
    if (!coinLoaded || !moneyLoaded) return;

    if (allRegistrations.length === 0) {
      setTournaments([]);
      setLoadingDetails(false);
      return;
    }

    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    setLoadingDetails(true);

    const tournamentMap = new Map<string, Tournament>();
    const loadedKeys = new Set<string>();

    const uniqueRegistrations = Array.from(
      new Map(
        allRegistrations.map((registration) => [
          `${registration.tournamentType}_${registration.tournamentId}`,
          registration,
        ])
      ).values()
    );

    const expectedCount = uniqueRegistrations.length;

    function publish() {
      if (cancelled) return;

      setTournaments(
        Array.from(tournamentMap.values()).sort(
          (a, b) => b.createdAtSeconds - a.createdAtSeconds
        )
      );

      if (loadedKeys.size >= expectedCount) {
        setLoadingDetails(false);
      }
    }

    for (const registration of uniqueRegistrations) {
      const collectionName =
        registration.tournamentType === "money"
          ? "moneyTournaments"
          : "tournaments";

      const key =
        `${registration.tournamentType}_${registration.tournamentId}`;

      const tournamentRef = doc(
        db,
        collectionName,
        registration.tournamentId
      );

      const unsubscribe = onSnapshot(
        tournamentRef,
        (snapshot) => {
          loadedKeys.add(key);

          if (!snapshot.exists()) {
            tournamentMap.delete(key);
            publish();
            return;
          }

          const data = snapshot.data();

          const isMoney =
            registration.tournamentType === "money";

          const points = Number(
            data.points ??
              registration.tournamentPoints ??
              0
          );

          const bannerType = Number(
            data.bannerType ?? data.entryFee ?? 10
          );

          const category = String(
            registration.category ??
              data.category ??
              (Number(data.maxPlayers) === 8
                ? "eightPlayers"
                : "sixteenPlayers")
          );

          const maxPlayers = Number(
            data.maxPlayers ??
              data.players ??
              (category === "eightPlayers" || category === "8"
                ? 8
                : 16)
          );

          const tournament: Tournament = {
            id: snapshot.id,
            tournamentType: registration.tournamentType,
            points,
            image: isMoney
              ? getMoneyTournamentImage(bannerType)
              : data.image || getTournamentImage(points),
            description: String(data.description || ""),
            date: String(
              registration.date || data.date || ""
            ),
            time: String(
              registration.time || data.time || ""
            ),
            category,
            players: maxPlayers,
            entryFee: Number(
              registration.entryFee ?? data.entryFee ?? 0
            ),
            rewardCoins: isMoney
              ? 0
              : Number(
                  registration.rewardCoins ??
                    data.rewardCoins ??
                    data.coins ??
                    0
                ),
            cashPrize: isMoney
              ? Number(data.cashPrize ?? 0)
              : 0,
            firstPrize: isMoney
              ? Number(data.firstPrize ?? 0)
              : 0,

            secondPrize: isMoney
              ? Number(data.secondPrize ?? 0)
              : 0,
            status: String(data.status || "upcoming"),
            registeredPlayers: Number(
              data.registeredPlayers ?? 0
            ),
            maxPlayers,
            scores: data.scores || {},
            matchPlayers: data.matchPlayers || {},
            createdAtSeconds:
              registration.createdAt?.seconds || 0,
          };

          tournamentMap.set(key, tournament);
          publish();
        },
        (error) => {
          console.error(
            `Tournament load failed: ${key}`,
            error
          );

          loadedKeys.add(key);
          tournamentMap.delete(key);
          publish();
        }
      );

      unsubscribers.push(unsubscribe);
    }

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [allRegistrations, coinLoaded, moneyLoaded]);

  // UPCOMING TOURNAMENTS
  const upcomingTournaments = useMemo(() => {
    if (!userId) return [];

    return tournaments.filter(
      (tournament) =>
        !isTournamentPlayed(tournament, userId)
    );
  }, [tournaments, userId]);

  // PLAYED TOURNAMENTS
  const playedTournaments = useMemo(() => {
    if (!userId) return [];

    return tournaments.filter(
      (tournament) =>
        isTournamentPlayed(tournament, userId)
    );
  }, [tournaments, userId]);

  const displayedTournaments =
    activeTab === "upcoming"
      ? upcomingTournaments
      : activeTab === "played"
      ? playedTournaments
      : [];

  // INITIAL LOADING
  if (
    authLoading ||
    (!coinLoaded && !moneyLoaded) ||
    (loadingDetails && tournaments.length === 0)
  ) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-[#eeeeee]">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-[#FFD600] border-t-[#111111]" />

            <p className="mt-3 text-[11px] font-bold text-[#777777]">
              Loading tournaments...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-[#eeeeee] pb-[82px]">
        {/* HEADER */}
        <header className="flex h-[112px] items-center bg-[#FFD600] px-7">
          <img
            src="/logo.png"
            alt="eFOOTBALL TOURNAMENTS"
            className="h-[48px] w-[185px] object-contain object-left"
          />
        </header>

        {/* TABS */}
        <div className="border-b border-[#dedede] bg-white">
          <div className="grid grid-cols-3">
            <button
              type="button"
              onClick={() => setActiveTab("upcoming")}
              className={`relative h-[62px] text-[16px] font-black ${
                activeTab === "upcoming"
                  ? "text-[#111111]"
                  : "text-[#a7a7a7]"
              }`}
            >
              Upcoming

              {activeTab === "upcoming" && (
                <span className="absolute bottom-0 left-[20px] right-[20px] h-[4px] rounded-full bg-[#FFD600]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("played")}
              className={`relative h-[62px] text-[16px] font-black ${
                activeTab === "played"
                  ? "text-[#111111]"
                  : "text-[#a7a7a7]"
              }`}
            >
              You Played

              {activeTab === "played" && (
                <span className="absolute bottom-0 left-[20px] right-[20px] h-[4px] rounded-full bg-[#FFD600]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("onevone")}
              className={`relative h-[62px] text-[15px] font-black ${
                activeTab === "onevone"
                  ? "text-[#111111]"
                  : "text-[#a7a7a7]"
              }`}
            >
              1v1 Matches

              {activeTab === "onevone" && (
                <span className="absolute bottom-0 left-[15px] right-[15px] h-[4px] rounded-full bg-[#FFD600]" />
              )}
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <section className="min-h-[calc(100vh-256px)] bg-[#eeeeee] px-3 pb-8 pt-8">
          {/* 1V1 MATCHES TAB */}
          {activeTab === "onevone" ? (
            !oneVsOneLoaded ? (
              <div className="flex min-h-[350px] items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-[#FFD600] border-t-[#111111]" />

                  <p className="mt-3 text-[11px] font-bold text-[#777777]">
                    Loading 1v1 matches...
                  </p>
                </div>
              </div>
            ) : oneVsOneMatches.length > 0 ? (
              <div className="flex flex-col items-center gap-5 pb-5">
                {oneVsOneMatches.map((match) => (
                  <OneVsOneMatchCard
                    key={match.id}
                    match={match}
                    userId={userId || ""}
                    usernames={usernames}
                    profilePhotos={profilePhotos}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[350px] items-center justify-center px-5">
                <div className="w-full rounded-[22px] border border-[#dedede] bg-white px-6 py-10 text-center shadow-[0_4px_14px_rgba(0,0,0,0.05)]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD600] text-[30px]">
                    ⚔️
                  </div>

                  <p className="mt-5 text-[17px] font-black text-[#111111]">
                    No 1v1 Matches Yet
                  </p>

                  <p className="mx-auto mt-2 max-w-[260px] text-[12px] font-medium leading-5 text-[#8b8b8b]">
                    Matches you create or join will appear here.
                  </p>
                </div>
              </div>
            )
          ) : displayedTournaments.length > 0 ? (
            <div className="flex flex-col items-center gap-5 pb-5">
              {displayedTournaments.map((tournament) => (
                <TournamentCard
                  key={`${tournament.tournamentType}_${tournament.id}`}
                  tournament={tournament}
                  userId={userId || ""}
                  onOpen={() => {
                    if (tournament.tournamentType === "money") {
                      router.push(
                        `/money/tournament/${tournament.id}`
                      );
                    } else {
                      router.push(
                        `/tournament/${tournament.id}`
                      );
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[350px] items-center justify-center px-5">
              <div className="w-full rounded-[22px] border border-[#dedede] bg-white px-6 py-10 text-center shadow-[0_4px_14px_rgba(0,0,0,0.05)]">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD600] text-[30px]">
                  {activeTab === "upcoming" ? "🎮" : "🏆"}
                </div>

                <p className="mt-5 text-[17px] font-black text-[#111111]">
                  {activeTab === "upcoming"
                    ? "No upcoming tournaments"
                    : "No tournaments played yet"}
                </p>

                <p className="mx-auto mt-2 max-w-[260px] text-[12px] font-medium leading-5 text-[#8b8b8b]">
                  {activeTab === "upcoming"
                    ? "Your confirmed coin and money tournaments will appear here."
                    : "Coin and money tournaments you played will appear here."}
                </p>
              </div>
            </div>
          )}
        </section>

        <BottomNavigation />
      </div>
    </main>
  );
}