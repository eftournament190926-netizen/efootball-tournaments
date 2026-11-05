"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

/* =================================================
   TYPES
================================================= */

type Tournament = {
  id: string;
  coins: number;
  cashPrize: number;
  entryFee: number;
  bannerType?: number;
  registeredPlayers: number;
  maxPlayers: number;
  category: string;
  date: string;
  time: string;
  status: string;

  // 4 PLAYER PRIZES
  firstPrize?: number;
  secondPrize?: number;
};

type OneVsOneMatch = {
  id: string;
  hostId: string;
  hostName: string;
  opponentId?: string | null;
  date: string;
  time: string;
  entryFee: number;
  winnerReward: number;
  status: string;
  adminApproved?: boolean;
};

type DateTab = {
  key: string;
  label: string;
};

/* =================================================
   DATE HELPERS
================================================= */

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createDateTabs(): DateTab[] {
  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);

    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() + index);

    let label = "";

    if (index === 0) {
      label = "TODAY";
    } else if (index === 1) {
      label = "TOMORROW";
    } else {
      label = date.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    }

    return {
      key: getDateKey(date),
      label,
    };
  });
}

/* =================================================
   IMAGE
================================================= */

function getTournamentImage(tournament: Tournament) {
  const bannerType = Number(
    tournament.bannerType || tournament.entryFee
  );

  const validBanners = [10, 20, 30, 40, 50, 100];

  if (validBanners.includes(bannerType)) {
    return `/images/money/${bannerType}.png`;
  }

  return "/images/money/10.png";
}
/* =================================================
   CATEGORY
================================================= */

type PlayerTab = "16" | "8" | "4" | "1v1";

const ONE_V_ONE_REWARDS: Record<number, number> = {
  10: 15,
  20: 30,
  30: 50,
  40: 70,
  50: 90,
  100: 180,
  150: 250,
  200: 350,
};

const PLAYER_TABS: { key: PlayerTab; label: string }[] = [
  { key: "16", label: "16 Players" },
  { key: "8", label: "8 Players" },
  { key: "4", label: "4 Players" },
  { key: "1v1", label: "1v1 Players" },
];

function getPlayerTab(tournament: Tournament): PlayerTab | null {
  const category = String(tournament.category || "")
    .toLowerCase().replace(/[\s_-]/g, "");

  // 1v1 must be checked first so it isn't confused with another size.
  if (category.includes("1v1") || category.includes("onevsone") ||
      category.includes("headtohead")) return "1v1";

  const max = Number(tournament.maxPlayers);
  if (max === 16 || category.includes("16") || category.includes("sixteen")) return "16";
  if (max === 8 || category.includes("8") || category.includes("eight")) return "8";
  if (max === 4 || category.includes("4") || category.includes("four")) return "4";
  if (max === 2) return "1v1";
  return null;
}

/* =================================================
   DATE FORMAT
================================================= */

function formatDate(dateString: string) {
  if (!dateString) return "";

  const parts = dateString.split("-");

  if (parts.length !== 3) {
    return dateString;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  const date = new Date(
    year,
    month - 1,
    day
  );

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/* =================================================
   TIME
================================================= */

function timeToMinutes(time: string) {
  if (!time) return 0;

  const clean = time.trim().toUpperCase();

  const twentyFourHourMatch =
    clean.match(/^(\d{1,2}):(\d{2})$/);

  if (twentyFourHourMatch) {
    const hour = Number(
      twentyFourHourMatch[1]
    );

    const minute = Number(
      twentyFourHourMatch[2]
    );

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return hour * 60 + minute;
    }
  }

  const twelveHourMatch =
    clean.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/
    );

  if (twelveHourMatch) {
    let hour = Number(
      twelveHourMatch[1]
    );

    const minute = Number(
      twelveHourMatch[2] || 0
    );

    const period =
      twelveHourMatch[3];

    if (
      period === "AM" &&
      hour === 12
    ) {
      hour = 0;
    }

    if (
      period === "PM" &&
      hour !== 12
    ) {
      hour += 12;
    }

    return hour * 60 + minute;
  }

  return 0;
}

function formatTime12Hour(time: string) {
  if (!time) return "";

  const clean = time.trim().toUpperCase();

  const twentyFourHourMatch =
    clean.match(/^(\d{1,2}):(\d{2})$/);

  if (twentyFourHourMatch) {
    const hour = Number(
      twentyFourHourMatch[1]
    );

    const minute = Number(
      twentyFourHourMatch[2]
    );

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      const period =
        hour >= 12 ? "PM" : "AM";

      let displayHour =
        hour % 12;

      if (displayHour === 0) {
        displayHour = 12;
      }

      return `${displayHour}:${String(
        minute
      ).padStart(2, "0")} ${period}`;
    }
  }

  const twelveHourMatch =
    clean.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/
    );

  if (twelveHourMatch) {
    const hour = Number(
      twelveHourMatch[1]
    );

    const minute = Number(
      twelveHourMatch[2] || 0
    );

    const period =
      twelveHourMatch[3];

    return `${hour}:${String(
      minute
    ).padStart(2, "0")} ${period}`;
  }

  return time;
}

/* =================================================
   EXPIRY
================================================= */

function isTournamentExpired(
  tournament: Tournament,
  now: Date
) {
  if (
    !tournament.date ||
    !tournament.time
  ) {
    return false;
  }

  const dateParts =
    tournament.date.split("-");

  if (dateParts.length !== 3) {
    return false;
  }

  const year = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const day = Number(dateParts[2]);

  if (!year || !month || !day) {
    return false;
  }

  const tournamentMinutes =
    timeToMinutes(
      tournament.time
    );

  const hour =
    Math.floor(
      tournamentMinutes / 60
    );

  const minute =
    tournamentMinutes % 60;

  const tournamentDateTime =
    new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      0,
      0
    );

  return now >= tournamentDateTime;
}

/* =================================================
   TOURNAMENT CARD
================================================= */

function TournamentCard({
  tournament,
}: {
  tournament: Tournament;
}) {
  const registered = Number(
    tournament.registeredPlayers || 0
  );

  const maxPlayers = Number(
    tournament.maxPlayers || 0
  );

  const percentage =
    maxPlayers > 0
      ? Math.min(
          (registered / maxPlayers) * 100,
          100
        )
      : 0;

  const isFull =
    maxPlayers > 0 &&
    registered >= maxPlayers;

  return (
    <div className="w-[238px] shrink-0 overflow-hidden rounded-[18px] border border-[#dedede] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.08)]">
      {/* TOURNAMENT CARD BANNER */}

{maxPlayers === 4 ? (

  /* CUSTOM 4 PLAYER BANNER */

  <div className="relative h-[124px] overflow-hidden bg-gradient-to-br from-[#171717] via-[#292000] to-[#111111]">

    {/* BACKGROUND DESIGN */}

    <div className="absolute -right-8 -top-12 h-[150px] w-[150px] rounded-full border-[22px] border-[#FFD600]/10" />

    <div className="absolute -bottom-16 -left-8 h-[150px] w-[150px] rounded-full border-[20px] border-white/5" />

    <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,rgba(255,214,0,0.10)_50%,transparent_65%)]" />

    {/* TOP LABEL */}

    <div className="absolute left-3 top-3 rounded-[6px] bg-[#FFD600] px-2 py-[5px] text-[9px] font-black tracking-wider text-[#111111]">
      4 PLAYERS
    </div>

    {/* MAIN TITLE */}

    <div className="absolute bottom-3 left-4">

      

      <div className="mt-2 flex items-center gap-5">
  <div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
      1st Prize
    </p>
    <p className="text-[25px] font-black italic leading-none text-[#FFD600]">
      ₹{tournament.firstPrize ?? 0}
    </p>
  </div>

  <div className="h-9 w-px bg-white/20" />

  <div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
      2nd Prize
    </p>
    <p className="text-[25px] font-black italic leading-none text-white">
      ₹{tournament.secondPrize ?? 0}
    </p>
  </div>
</div>

    </div>

    {/* DECORATIVE NUMBER */}

    <div className="absolute bottom-[-19px] right-3 text-[95px] font-black italic leading-none text-[#FFD600]/10">
      4
    </div>

  </div>

) : (

  /* EXISTING BANNERS FOR OTHER TOURNAMENTS */

  <div className="relative h-[124px] overflow-hidden bg-[#111111]">

    <img
      src={getTournamentImage(tournament)}
      alt={`${tournament.entryFee} Points Money Tournament`}
      className="h-full w-full object-cover"
    />

    <div className="absolute left-3 top-3 rounded-[8px] bg-[#FFD600] px-3 py-[6px] text-[9px] font-black text-[#111111] shadow-md">
      {maxPlayers} PLAYERS
    </div>

  </div>

)}

      {/* DATE */}

      <div className="flex items-center justify-between border-b border-[#eeeeee] bg-[#fff9d9] px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase text-[#111111]">
            {formatDate(
              tournament.date
            )}
          </p>

          <p className="mt-[2px] text-[9px] font-bold text-[#696969]">
            {formatTime12Hour(
              tournament.time
            )}
          </p>
        </div>

        <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#111111] text-[13px]">
          🎮
        </div>
      </div>

      {/* DETAILS */}

      <div className="p-4">
        <div className="flex">
          <div className="w-1/2 border-r border-[#e5e5e5] pr-3">
            <p className="text-[8px] font-bold uppercase tracking-wide text-[#999999]">
              Entry Fee
            </p>

            <p className="mt-1 text-[14px] font-black text-[#111111]">
              ₹{tournament.entryFee}
            </p>
          </div>

          <div className="w-1/2 pl-3">
            <p className="text-[8px] font-bold uppercase tracking-wide text-[#999999]">
              Winner Reward
            </p>

            <p className="mt-1 text-[14px] font-black text-[#087A43]">
  ₹{tournament.cashPrize}
</p>

<p className="text-[8px] font-black text-[#087A43]">
  CASH PRIZE
</p>
          </div>
        </div>

        {/* PROGRESS */}

        <div className="mt-4">
          <div className="mb-[5px] flex items-center justify-between">
            <span className="text-[8px] font-black text-[#777777]">
              PLAYERS
            </span>

            <span className="text-[8px] font-black text-[#111111]">
              {registered}/{maxPlayers}
            </span>
          </div>

          <div className="h-[6px] overflow-hidden rounded-full bg-[#e7e7e7]">
            <div
              className="h-full rounded-full bg-[#087A43] transition-all"
              style={{
                width: `${percentage}%`,
              }}
            />
          </div>
        </div>

        {/* BUTTON */}

        {isFull ? (
          <button
            type="button"
            disabled
            className="mt-4 w-full rounded-[10px] bg-[#dddddd] py-[11px] text-[10px] font-black tracking-[0.05em] text-[#888888]"
          >
            TOURNAMENT FULL
          </button>
        ) : (
          <Link
            href={`/money/tournament/${tournament.id}`}
            className="mt-4 flex w-full items-center justify-center rounded-[10px] bg-[#111111] py-[11px] text-[10px] font-black tracking-[0.06em] text-[#FFD600] shadow-md transition active:scale-[0.98]"
          >
            JOIN NOW →
          </Link>
        )}
      </div>
    </div>
  );
}

/* =================================================
   TIME SELECTOR
================================================= */

function TimeSelector({
  value,
  times,
  onChange,
}: {
  value: string;
  times: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) =>
        onChange(
          event.target.value
        )
      }
      className="h-[44px] min-w-[124px] appearance-auto rounded-[10px] border-2 border-[#111111] bg-white px-3 text-[11px] font-black text-[#111111] shadow-sm outline-none"
    >
      <option value="">
        ALL TIMES
      </option>

      {times.map((time) => (
        <option
          key={time}
          value={time}
        >
          {formatTime12Hour(
            time
          )}
        </option>
      ))}
    </select>
  );
}

/* =================================================
   EMPTY STATE
================================================= */

function EmptyTournamentState() {
  return (
    <div className="flex min-h-[270px] items-center justify-center rounded-[17px] border border-[#dedede] bg-white px-5 shadow-[0_3px_12px_rgba(0,0,0,0.03)]">
      <div className="text-center">
        {/* TROPHY CIRCLE */}

        <div className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#FFF5C4]">
          <span className="text-[38px]">
            🏆
          </span>
        </div>

        <p className="mt-5 text-[14px] font-black text-[#182033]">
          No tournaments available
        </p>

        <p className="mt-2 text-[10px] font-medium text-[#8d94a1]">
          No tournament scheduled for this date and time.
        </p>
      </div>
    </div>
  );
}

/* =================================================
   SECTION TITLE
================================================= */

function PlayerSectionTitle({
  title,
}: {
  title: string;
}) {
  return (
    <div className="relative flex h-[44px] min-w-[150px] items-center overflow-hidden rounded-[10px] bg-[#111111] px-4 pr-9 shadow-sm">
      {/* ICON */}

      <span className="mr-2 text-[17px]">
        👥
      </span>

      {/* TEXT */}

      <span className="relative z-10 text-[13px] font-black text-[#FFD600]">
        {title}
      </span>

      {/* YELLOW DIAGONAL ACCENT */}

      <div className="absolute -right-[10px] top-[-10px] h-[70px] w-[24px] rotate-[24deg] bg-[#FFD600]" />
    </div>
  );
}

/* =================================================
   TOURNAMENT SECTION
================================================= */

function TournamentSection({
  title,
  tournaments,
  now,
}: {
  title: string;
  tournaments: Tournament[];
  now: Date;
}) {
  const visibleTournaments = useMemo(() => {
  return tournaments.filter((tournament) => {
    const registered = Number(tournament.registeredPlayers || 0);
    const maxPlayers = Number(tournament.maxPlayers || 0);

    // Hide only when all player slots are filled
    return maxPlayers > 0 && registered < maxPlayers;
  });
}, [tournaments]);

  const times =
    useMemo(() => {
      const uniqueTimes =
        Array.from(
          new Set(
            visibleTournaments
              .map(
                (item) =>
                  item.time
              )
              .filter(Boolean)
          )
        );

      return uniqueTimes.sort(
        (a, b) =>
          timeToMinutes(a) -
          timeToMinutes(b)
      );
    }, [
      visibleTournaments,
    ]);

  const [
    selectedTime,
    setSelectedTime,
  ] = useState("");

  const filteredTournaments =
    useMemo(() => {
      if (!selectedTime) {
        return visibleTournaments;
      }

      return visibleTournaments.filter(
        (tournament) =>
          tournament.time ===
          selectedTime
      );
    }, [
      visibleTournaments,
      selectedTime,
    ]);

  return (
    <section className="bg-[#f5f5f5] px-4 pb-7 pt-5">
      {/* TOP */}

      <div className="mb-4 flex items-center justify-between gap-3">
        <PlayerSectionTitle
          title={title}
        />

        <TimeSelector
          value={selectedTime}
          times={times}
          onChange={
            setSelectedTime
          }
        />
      </div>

      {/* CONTENT */}

      {filteredTournaments.length ===
      0 ? (
        <EmptyTournamentState />
      ) : (
        <div className="scrollbar-none flex gap-4 overflow-x-auto pb-2">
          {filteredTournaments.map(
            (tournament) => (
              <TournamentCard
                key={
                  tournament.id
                }
                tournament={
                  tournament
                }
              />
            )
          )}
        </div>
      )}
    </section>
  );
}

/* =================================================
   BOTTOM NAV
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
      className="relative flex h-full flex-col items-center justify-center"
    >
      {/* TOP ACTIVE LINE */}

      {active && (
        <div className="absolute left-1/2 top-0 h-[4px] w-[56px] -translate-x-1/2 rounded-b-full bg-[#FFD600]" />
      )}

      <span
        className={`flex h-[28px] items-center justify-center text-[21px] ${
          active
            ? ""
            : "grayscale opacity-60"
        }`}
      >
        {icon}
      </span>

      <span
        className={`mt-[2px] text-center text-[8px] leading-[10px] ${
          active
            ? "font-black text-[#FFD600]"
            : "font-bold text-[#929292]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function BottomNavigation() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0b0b0b] shadow-[0_-6px_20px_rgba(0,0,0,0.15)]">
      <div className="mx-auto grid h-[78px] max-w-md grid-cols-5">
        <BottomNavItem
          icon="🏆"
          label="Tournaments"
          active
          onClick={() =>
            router.push("/")
          }
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
          onClick={() =>
            router.push(
              "/my-tournaments"
            )
          }
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
          onClick={() =>
            router.push(
              "/division"
            )
          }
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
          onClick={() =>
            router.push(
              "/leaderboard"
            )
          }
        />

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
   HOME
================================================= */

export default function MoneyPage() {
  const [pointsBalance, setPointsBalance] = useState(0);
  const [winningsBalance, setWinningsBalance] = useState(0);
  const [showAddPoints, setShowAddPoints] = useState(false);
  const [pointAmount, setPointAmount] = useState(50);

  const [addingPoints, setAddingPoints] = useState(false);
  const [addPointsError, setAddPointsError] = useState("");

  const [showWithdraw, setShowWithdraw] = useState(false);
const [withdrawAmount, setWithdrawAmount] = useState("");
const [upiId, setUpiId] = useState("");
const [withdrawing, setWithdrawing] = useState(false);
const [withdrawError, setWithdrawError] = useState("");

const [showConvert, setShowConvert] = useState(false);
const [convertAmount, setConvertAmount] = useState("");
const [converting, setConverting] = useState(false);
const [convertError, setConvertError] = useState("");

  const [dateTabs] =
    useState<DateTab[]>(
      () => createDateTabs()
    );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState<string>(
    () =>
      createDateTabs()[0]?.key ||
      ""
  );

  const [selectedPlayerTab, setSelectedPlayerTab] = useState<PlayerTab>("16");

  // 1v1 CREATE MATCH

const [showCreate1v1, setShowCreate1v1] = useState(false);

const [oneVsOneFee, setOneVsOneFee] = useState("50");

const [oneVsOneDate, setOneVsOneDate] = useState("");
const [oneVsOneTime, setOneVsOneTime] = useState("");

const [creating1v1, setCreating1v1] = useState(false);

const [oneVsOneError, setOneVsOneError] = useState("");
const [oneVsOneSuccess, setOneVsOneSuccess] = useState("");

const [availableMatches, setAvailableMatches] =
  useState<OneVsOneMatch[]>([]);

const [joiningMatchId, setJoiningMatchId] =
  useState("");

const [joinMatchError, setJoinMatchError] =
  useState("");

  const [now, setNow] =
    useState<Date>(
      () => new Date()
    );

  const [
    tournaments,
    setTournaments,
  ] = useState<Tournament[]>([]);

  const [
    profilePhoto,
    setProfilePhoto,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  /* =================================================
     CLOCK
  ================================================= */

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setNow(new Date());
      }, 30 * 1000);

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, []);

  /* =================================================
     FIREBASE TOURNAMENTS
  ================================================= */

  useEffect(() => {
    const tournamentsQuery =
      query(
        collection(
  db,
  "moneyTournaments"
),
        orderBy(
          "createdAt",
          "desc"
        )
      );

    const unsubscribe =
      onSnapshot(
        tournamentsQuery,

        (snapshot) => {
          const list:
            Tournament[] = [];

          snapshot.forEach(
            (document) => {
              const data =
                document.data();

              list.push({
                id: document.id,

                coins: Number(
                  data.coins || 0
                ),

                cashPrize: Number(
                  data.cashPrize || 0
                ),

                firstPrize: Number(data.firstPrize || 0),

secondPrize: Number(data.secondPrize || 0),

                entryFee: Number(
                  data.entryFee || 0
                ),

                registeredPlayers:
                  Number(
                    data.registeredPlayers ||
                      0
                  ),

                maxPlayers: Number(
                  data.maxPlayers ||
                    0
                ),

                category: String(
                  data.category || ""
                ),

                bannerType: Number(data.bannerType || 0),

                date: String(
                  data.date || ""
                ),

                time: String(
                  data.time || ""
                ),

                status: String(
                  data.status ||
                    "upcoming"
                ),
              });
            }
          );

          setTournaments(
            list
          );

          setLoading(false);
        },

        (error) => {
          console.error(
            "Error loading tournaments:",
            error
          );

          setTournaments([]);

          setLoading(false);
        }
      );

    return () =>
      unsubscribe();
  }, []);

 /* =========================================
   AVAILABLE 1V1 MATCHES
========================================= */

useEffect(() => {
  const matchesQuery = query(
    collection(db, "oneVsOneMatches"),
    orderBy("createdAt", "desc")
  );

  let active = true;

  const unsubscribe = onSnapshot(
    matchesQuery,
    async (snapshot) => {
      try {
        const list = await Promise.all(
          snapshot.docs.map(async (document) => {
            const data = document.data();

            if (
              data.status !== "waiting_for_opponent" ||
              data.adminApproved !== true
            ) {
              return null;
            }

            let hostName = String(data.hostName || "").trim();

            // Old records may contain email instead of username.
            if (!hostName || hostName.includes("@")) {
              const hostId = String(data.hostId || "");

              if (hostId) {
                try {
                  const hostSnap = await getDoc(
                    doc(db, "users", hostId)
                  );

                  if (hostSnap.exists()) {
                    const hostData = hostSnap.data();

                    hostName = String(
                      hostData.username || "Player"
                    ).trim();
                  } else {
                    hostName = "Player";
                  }
                } catch (error) {
                  console.error(
                    "Error loading host username:",
                    error
                  );

                  hostName = "Player";
                }
              } else {
                hostName = "Player";
              }
            }

            return {
              id: document.id,
              hostId: data.hostId || "",
              hostName,
              opponentId: data.opponentId || null,
              date: data.date || "",
              time: data.time || "",
              entryFee: Number(data.entryFee || 0),
              winnerReward: Number(data.winnerReward || 0),
              status: data.status,
              adminApproved: data.adminApproved,
            } as OneVsOneMatch;
          })
        );

        if (active) {
          setAvailableMatches(
            list.filter(
              (match): match is OneVsOneMatch => match !== null
            )
          );
        }
      } catch (error) {
        console.error(
          "1v1 matches loading error:",
          error
        );
      }
    },
    (error) => {
      console.error(
        "1v1 matches loading error:",
        error
      );
    }
  );

  return () => {
    active = false;
    unsubscribe();
  };
}, []);

  /* =================================================
     PROFILE PHOTO
  ================================================= */

  useEffect(() => {
  const unsubscribe = onAuthStateChanged(
    auth,
    async (user) => {
      if (!user) {
        setProfilePhoto("");
        setPointsBalance(0);
        setWinningsBalance(0);
        return;
      }

      try {
        const userSnap = await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );

        if (userSnap.exists()) {
          const data = userSnap.data();

          // PROFILE PHOTO
          setProfilePhoto(
            data.profilePhoto || ""
          );

          // POINTS BALANCE
          setPointsBalance(
            Number(
              data.pointsBalance || 0
            )
          );

          // WINNINGS BALANCE
          setWinningsBalance(
            Number(
              data.winningsBalance || 0
            )
          );
        } else {
          setProfilePhoto("");
          setPointsBalance(0);
          setWinningsBalance(0);
        }
      } catch (error) {
        console.error(
          "Error loading user wallet:",
          error
        );

        setPointsBalance(0);
        setWinningsBalance(0);
      }
    }
  );

  return () =>
    unsubscribe();
}, []);

  /* =================================================
     FILTER SELECTED DATE
  ================================================= */

  const selectedDateTournaments =
  useMemo(() => {
    return tournaments
      .filter(
        (tournament) =>
          tournament.date === selectedDate &&
          tournament.status !== "cancelled" &&
          tournament.status !== "completed"
      )
      .sort((a, b) => {
        return (
          timeToMinutes(a.time) -
          timeToMinutes(b.time)
        );
      });
  }, [
    tournaments,
    selectedDate,
  ]);

     /* =================================================
      SELECTED PLAYER CATEGORY
   ================================================= */

  const selectedPlayerTournaments = useMemo(() =>
    selectedDateTournaments.filter(
      (tournament) => getPlayerTab(tournament) === selectedPlayerTab
    ), [selectedDateTournaments, selectedPlayerTab]
  );

const handleAddPointsRequest = async () => {
  setAddPointsError("");

  if (pointAmount < 50 || !Number.isSafeInteger(pointAmount)) {
  setAddPointsError(
    "Minimum point purchase is ₹50. Enter a valid whole amount."
  );
  return;
}

  const user = auth.currentUser;

  if (!user) {
    setAddPointsError(
      "Please login to add points."
    );
    return;
  }

  try {
    setAddingPoints(true);

    const requestRef = await addDoc(
      collection(db, "pointRequests"),
      {
        userId: user.uid,
        email: user.email || "",

        amount: pointAmount,
        points: pointAmount,

        status: "pending",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    const message = [
      "Hi, I want to add tournament points.",
      "",
      `Amount: ₹${pointAmount}`,
      `Points: ${pointAmount} P`,
      `Request ID: ${requestRef.id}`,
      "",
      "Please send payment details.",
    ].join("\n");

    const adminNumber = "918848558182";

    const whatsappUrl =
      `https://wa.me/${adminNumber}?text=${encodeURIComponent(
        message
      )}`;

    window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );

    setShowAddPoints(false);
    setPointAmount(50);
  } catch (error) {
    console.error(
      "Error creating point request:",
      error
    );

    setAddPointsError(
      "Could not create request. Please try again."
    );
  } finally {
    setAddingPoints(false);
  }
};

async function handleCreateOneVsOneMatch() {
  setOneVsOneError("");
  setOneVsOneSuccess("");

  const user = auth.currentUser;

  if (!user) {
    setOneVsOneError("Please login to create a match.");
    return;
  }

  const fee = Number(oneVsOneFee);
  const reward = ONE_V_ONE_REWARDS[fee];

  if (!reward) {
    setOneVsOneError("Please select a valid entry fee.");
    return;
  }

  if (!oneVsOneDate || !oneVsOneTime) {
    setOneVsOneError("Please select match date and time.");
    return;
  }

  if (pointsBalance < fee) {
    setOneVsOneError(
      `You need at least ${fee} points to create this match.`
    );
    return;
  }

  const matchDateTime = new Date(
    `${oneVsOneDate}T${oneVsOneTime}:00`
  );

  if (
    Number.isNaN(matchDateTime.getTime()) ||
    matchDateTime.getTime() <= Date.now()
  ) {
    setOneVsOneError(
      "Please select a future date and time."
    );
    return;
  }

  // Open a window during the click to reduce popup blocking.
  const whatsappWindow = window.open("about:blank", "_blank");

  try {
    setCreating1v1(true);

    const userSnap = await getDoc(
  doc(db, "users", user.uid)
);

if (!userSnap.exists()) {
  throw new Error("User profile not found.");
}

const userData = userSnap.data();

const username = String(
  userData.username || ""
).trim();

if (!username) {
  throw new Error(
    "Username not found. Please update your profile."
  );
}

    const matchRef = await addDoc(
      collection(db, "oneVsOneMatches"),
      {
        type: "1v1",

        hostId: user.uid,
hostEmail: user.email || "",
hostName: username,

        opponentId: null,
        opponentEmail: "",
        opponentName: "",

        date: oneVsOneDate,
        time: oneVsOneTime,

        entryFee: fee,
        winnerReward: reward,

        status: "pending_admin_approval",
        adminApproved: false,

        roomCode: "",

        hostScore: null,
        opponentScore: null,
        winnerId: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    const message = [
      "TOURNEX - NEW 1v1 MATCH REQUEST",
      "",
      `Request ID: ${matchRef.id}`,
      `Host: ${username}`,
      `Date: ${oneVsOneDate}`,
      `Time: ${oneVsOneTime}`,
      `Entry Fee: ${fee} Points`,
      `Winner Reward: ${reward} Points`,
      "",
      "Please review and approve this match.",
    ].join("\n");

    const whatsappUrl =
      `https://wa.me/918848558182?text=${encodeURIComponent(message)}`;

    if (whatsappWindow) {
      whatsappWindow.location.assign(whatsappUrl);
    } else {
      window.open(whatsappUrl, "_blank");
    }

    setOneVsOneSuccess(
      "Match request submitted! Waiting for admin approval."
    );

    setShowCreate1v1(false);

    setOneVsOneDate("");
    setOneVsOneTime("");
    setOneVsOneFee("50");

  } catch (error) {
    console.error("1v1 match creation failed:", error);

    whatsappWindow?.close();

    setOneVsOneError(
      "Could not create match request. Please try again."
    );
  } finally {
    setCreating1v1(false);
  }
}

async function handleJoinOneVsOneMatch(
  match: OneVsOneMatch
) {
  setJoinMatchError("");

  const user = auth.currentUser;

  if (!user) {
    setJoinMatchError("Please login to join.");
    return;
  }

  if (user.uid === match.hostId) {
    setJoinMatchError(
      "You cannot join your own match."
    );
    return;
  }

  try {
    setJoiningMatchId(match.id);

    await runTransaction(db, async (transaction) => {
      const matchRef = doc(
        db,
        "oneVsOneMatches",
        match.id
      );

      const opponentRef = doc(
        db,
        "users",
        user.uid
      );

      const hostRef = doc(
        db,
        "users",
        match.hostId
      );

      const matchSnap = await transaction.get(matchRef);

      if (!matchSnap.exists()) {
        throw new Error("Match not found.");
      }

      const matchData = matchSnap.data();

      if (
        matchData.status !== "waiting_for_opponent" ||
        matchData.adminApproved !== true ||
        matchData.opponentId
      ) {
        throw new Error(
          "This match is no longer available."
        );
      }

      const opponentSnap =
        await transaction.get(opponentRef);

      const hostSnap =
        await transaction.get(hostRef);

      if (!opponentSnap.exists() || !hostSnap.exists()) {
        throw new Error("Player account not found.");
      }

      const opponentData = opponentSnap.data();
      const hostData = hostSnap.data();

      const fee = Number(matchData.entryFee || 0);

      const opponentBalance = Number(
        opponentData.pointsBalance || 0
      );

      const hostBalance = Number(
        hostData.pointsBalance || 0
      );

      if (opponentBalance < fee) {
        throw new Error(
          "Insufficient points in your wallet."
        );
      }

      if (hostBalance < fee) {
        throw new Error(
          "Host does not have sufficient points. Contact admin."
        );
      }

      // Deduct both players' entry fees.
      transaction.update(hostRef, {
        pointsBalance: hostBalance - fee,
      });

      transaction.update(opponentRef, {
        pointsBalance: opponentBalance - fee,
      });

      // Confirm match.
      transaction.update(matchRef, {
        opponentId: user.uid,
opponentEmail: user.email || "",
opponentName: String(
  opponentData.username || "Player"
).trim(),

        status: "matched",
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    setPointsBalance((current) => current - match.entryFee);

    window.alert(
      "Match joined successfully!"
    );

  } catch (error) {
    console.error("Join match failed:", error);

    setJoinMatchError(
      error instanceof Error
        ? error.message
        : "Could not join match."
    );

  } finally {
    setJoiningMatchId("");
  }
}

async function handleWithdrawRequest() {
  setWithdrawError("");

  const amount = Number(withdrawAmount);

  if (!amount || amount < 10) {
    setWithdrawError(
      "Minimum withdrawal is ₹10."
    );
    return;
  }

  if (!Number.isInteger(amount)) {
    setWithdrawError(
      "Please enter a whole rupee amount."
    );
    return;
  }

  if (!upiId.trim()) {
    setWithdrawError(
      "Please enter your UPI ID."
    );
    return;
  }

  const user = auth.currentUser;

  if (!user) {
    setWithdrawError(
      "Please login to withdraw."
    );
    return;
  }

  try {
    setWithdrawing(true);

    /* ---------------------------------
       CREATE REQUEST ID FIRST
    --------------------------------- */

    const requestRef = doc(
      collection(
        db,
        "withdrawRequests"
      )
    );

    /* ---------------------------------
       FIRESTORE TRANSACTION
    --------------------------------- */

    await runTransaction(
      db,
      async (transaction) => {
        const userRef = doc(
          db,
          "users",
          user.uid
        );

        const userSnap =
          await transaction.get(
            userRef
          );

        if (!userSnap.exists()) {
          throw new Error(
            "User account not found."
          );
        }

        const userData =
          userSnap.data();

        const currentWinnings =
          Number(
            userData.winningsBalance ||
              0
          );

        if (
          amount >
          currentWinnings
        ) {
          throw new Error(
            "Insufficient winnings balance."
          );
        }

        /* DEDUCT WINNINGS */

        transaction.update(
          userRef,
          {
            winningsBalance:
              currentWinnings -
              amount,
          }
        );

        /* CREATE WITHDRAW REQUEST */

        transaction.set(
          requestRef,
          {
            userId: user.uid,

            email:
              user.email || "",

            amount,

            upiId:
              upiId.trim(),

            status: "pending",

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          }
        );
      }
    );

    /* ---------------------------------
       WHATSAPP MESSAGE
    --------------------------------- */

    const message = [
      "Hi, I want to withdraw my tournament winnings.",
      "",
      `Amount: ₹${amount}`,
      `UPI ID: ${upiId.trim()}`,
      `Request ID: ${requestRef.id}`,
      "",
      "Please verify my withdrawal request.",
    ].join("\n");

    /*
      SAME NUMBER used in Add Points.

      Example:
      919876543210

      + symbol / spaces വേണ്ട.
    */

    const adminNumber =
      "918848558182";

    const whatsappUrl =
      `https://wa.me/${adminNumber}?text=${encodeURIComponent(
        message
      )}`;

    /* ---------------------------------
       UPDATE LOCAL UI
    --------------------------------- */

    setWinningsBalance(
      (current) =>
        current - amount
    );

    setShowWithdraw(false);

    setWithdrawAmount("");

    setUpiId("");

    /* ---------------------------------
       OPEN WHATSAPP
    --------------------------------- */

    window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );

  } catch (err) {
    console.error(
      "Withdrawal request failed:",
      err
    );

    setWithdrawError(
      err instanceof Error
        ? err.message
        : "Failed to submit withdrawal request."
    );
  } finally {
    setWithdrawing(false);
  }
}

async function handleConvertWinnings() {
  setConvertError("");

  const amount = Number(convertAmount);

  if (
    !Number.isSafeInteger(amount) ||
    amount < 1
  ) {
    setConvertError(
      "Enter a valid amount of at least ₹1."
    );
    return;
  }

  const user = auth.currentUser;

  if (!user) {
    setConvertError(
      "Please login to convert winnings."
    );
    return;
  }

  try {
    setConverting(true);

    const conversionRef = doc(
      collection(db, "walletTransactions")
    );

    await runTransaction(
      db,
      async (transaction) => {
        const userRef = doc(
          db,
          "users",
          user.uid
        );

        const userSnap =
          await transaction.get(userRef);

        if (!userSnap.exists()) {
          throw new Error(
            "User account not found."
          );
        }

        const userData = userSnap.data();

        const currentWinnings = Number(
          userData.winningsBalance ?? 0
        );

        const currentPoints = Number(
          userData.pointsBalance ?? 0
        );

        if (
          !Number.isSafeInteger(currentWinnings) ||
          !Number.isSafeInteger(currentPoints) ||
          currentWinnings < 0 ||
          currentPoints < 0
        ) {
          throw new Error(
            "Invalid wallet balance."
          );
        }

        if (amount > currentWinnings) {
          throw new Error(
            "Insufficient winnings balance."
          );
        }

        const newWinnings =
          currentWinnings - amount;

        const newPoints =
          currentPoints + amount;

        if (!Number.isSafeInteger(newPoints)) {
          throw new Error(
            "Points balance exceeds allowed limit."
          );
        }

        /* UPDATE WALLET */

        transaction.update(userRef, {
          winningsBalance: newWinnings,
          pointsBalance: newPoints,
        });

        /* SAVE CONVERSION HISTORY */

        transaction.set(conversionRef, {
          userId: user.uid,
          email: user.email || "",

          type: "winnings_to_points",

          amount,
          points: amount,

          status: "completed",

          winningsBefore: currentWinnings,
          winningsAfter: newWinnings,

          pointsBefore: currentPoints,
          pointsAfter: newPoints,

          createdAt: serverTimestamp(),
        });
      }
    );

    setShowConvert(false);
    setConvertAmount("");

    // Refresh wallet data using the existing
    // onSnapshot listener or on page reload.

    window.alert(
      `₹${amount} converted to ${amount} Points successfully!`
    );
  } catch (err) {
    console.error(
      "Winnings conversion failed:",
      err
    );

    setConvertError(
      err instanceof Error
        ? err.message
        : "Conversion failed. Please try again."
    );
  } finally {
    setConverting(false);
  }
}

  /* =================================================
     UI
  ================================================= */

  return (
    <main className="min-h-screen bg-[#e9e9e9]">
      <div className="mx-auto min-h-screen max-w-md overflow-hidden bg-white pb-[78px] shadow-[0_0_40px_rgba(0,0,0,0.12)]">
        {/* ============================================
            YELLOW HEADER
        ============================================ */}

        <header className="bg-[#FFD600]">
  <div className="flex h-[78px] items-center justify-between px-5">

    {/* LOGO */}
    <img
      src="/logo.png"
      alt="eFOOTBALL TOURNAMENTS"
      className="h-[52px] w-[155px] object-contain object-left"
    />

    
{/* COIN / MONEY SWITCH */}
<div className="flex items-center rounded-full bg-[#111111] p-[3px] shadow-md">

  {/* COIN - INACTIVE */}
  <Link
    href="/coin"
    className="flex h-[34px] w-[42px] items-center justify-center rounded-full text-[17px] transition active:scale-95"
    aria-label="Coin tournaments"
  >
    🪙
  </Link>

  {/* MONEY - ACTIVE */}
  <Link
    href="/money"
    className="flex h-[34px] w-[42px] items-center justify-center rounded-full bg-[#FFD600] text-[17px] transition active:scale-95"
    aria-label="Money tournaments"
  >
    💰
  </Link>

</div>


    {/* PROFILE */}
    <Link
      href="/profile"
      className="flex h-[44px] w-[44px] items-center justify-center overflow-hidden rounded-full border-[3px] border-[#111111] bg-white shadow-[0_3px_8px_rgba(0,0,0,0.18)]"
    >
      {profilePhoto ? (
        <img
          src={profilePhoto}
          alt="Profile"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[19px]">
          👤
        </span>
      )}
    </Link>

  </div>
</header>

{/* ============================================
    MONEY WALLET
============================================ */}

<section className="bg-[#111111] px-4 py-4">
  <div className="grid grid-cols-2 gap-3">

    {/* POINTS BALANCE */}
    <div className="rounded-[16px] bg-[#FFD600] p-4 shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-[20px]">🪙</span>

        <p className="text-[9px] font-black uppercase tracking-wide text-[#111111]/60">
          Points Balance
        </p>
      </div>

      <p className="mt-3 text-[25px] font-black text-[#111111]">
        {pointsBalance}
        <span className="ml-1 text-[12px]">
          P
        </span>
      </p>

      <button
  type="button"
  onClick={() => setShowAddPoints(true)}
  className="mt-3 w-full rounded-[9px] bg-[#111111] py-[9px] text-[9px] font-black text-[#FFD600] transition active:scale-[0.98]"
>
  + ADD POINTS
</button>
    </div>

    {/* WINNINGS */}
    <div className="rounded-[16px] border border-[#333333] bg-[#1b1b1b] p-4 shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-[20px]">💰</span>

        <p className="text-[9px] font-black uppercase tracking-wide text-[#888888]">
          Winnings
        </p>
      </div>

      <p className="mt-3 text-[25px] font-black text-white">
        ₹{winningsBalance}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
  type="button"
  onClick={() => {
    setWithdrawError("");
    setWithdrawAmount("");
    setUpiId("");
    setShowWithdraw(true);
  }}
  className="rounded-[9px] bg-[#FFD600] py-[9px] text-[8px] font-black text-[#111111] transition active:scale-[0.98]"
>
  WITHDRAW
</button>

        <button
  type="button"
  onClick={() => {
    setConvertAmount("");
    setConvertError("");
    setShowConvert(true);
  }}
  className="rounded-[9px] border border-[#FFD600] py-[9px] text-[8px] font-black text-[#FFD600] transition active:scale-[0.98]"
>
  CONVERT
</button>
      </div>
    </div>

  </div>

  {/* INFO */}
  <div className="mt-3 flex items-center justify-between px-1">
    <p className="text-[8px] font-bold text-[#777777]">
      ₹1 = 1 Point
    </p>

    <p className="text-[8px] font-bold text-[#777777]">
      Min. withdrawal ₹10
    </p>
  </div>
</section>

{showAddPoints && (
  <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 px-4 pb-5 sm:items-center">

    <div className="w-full max-w-md rounded-[22px] bg-white p-5 shadow-2xl">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase text-[#888888]">
            Tournament Wallet
          </p>

          <h2 className="mt-1 text-[20px] font-black text-[#111111]">
            Add Points
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setShowAddPoints(false)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eeeeee] text-[16px] font-black text-[#111111]"
        >
          ✕
        </button>
      </div>

      {/* CONVERSION */}
      <div className="mt-4 rounded-[12px] bg-[#FFF7CC] px-4 py-3">
        <p className="text-[11px] font-black text-[#111111]">
          ₹1 = 1 Point
        </p>

        <p className="mt-1 text-[9px] font-bold text-[#777777]">
          Minimum purchase ₹50
        </p>
      </div>

      {/* QUICK AMOUNTS */}
      <p className="mt-5 text-[9px] font-black uppercase text-[#777777]">
        Select Amount
      </p>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {[50, 100, 200, 500, 1000].map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setPointAmount(amount)}
            className={`rounded-[10px] border-2 py-3 text-[11px] font-black transition ${
              pointAmount === amount
                ? "border-[#111111] bg-[#FFD600] text-[#111111]"
                : "border-[#eeeeee] bg-white text-[#555555]"
            }`}
          >
            ₹{amount}
          </button>
        ))}
      </div>

      {/* CUSTOM AMOUNT */}
      <p className="mt-5 text-[9px] font-black uppercase text-[#777777]">
        Custom Amount
      </p>

      <div className="mt-2 flex items-center rounded-[12px] border-2 border-[#dddddd] px-4">
        <span className="text-[16px] font-black text-[#111111]">
          ₹
        </span>

        <input
  type="number"
  min="50"
  step="1"
  value={pointAmount}
  onChange={(event) =>
    setPointAmount(Number(event.target.value))
  }
  className="h-[50px] w-full bg-transparent px-2 text-[16px] font-black text-[#111111] outline-none"
/>
      </div>

      {/* POINT PREVIEW */}
      <div className="mt-4 flex items-center justify-between rounded-[12px] bg-[#111111] px-4 py-4">
        <span className="text-[10px] font-bold text-[#aaaaaa]">
          You will receive
        </span>

        <span className="text-[18px] font-black text-[#FFD600]">
          {pointAmount || 0} P
        </span>
      </div>

      {/* CONTINUE */}
      {addPointsError && (
  <p className="mt-3 text-center text-[9px] font-bold text-red-600">
    {addPointsError}
  </p>
)}

<button
  type="button"
  onClick={handleAddPointsRequest}
  disabled={
    pointAmount < 50 ||
    !Number.isSafeInteger(pointAmount) ||
    addingPoints
  }
  className="mt-4 w-full rounded-[12px] bg-[#FFD600] py-[14px] text-[11px] font-black text-[#111111] transition active:scale-[0.98] disabled:bg-[#dddddd] disabled:text-[#999999]"
>
  {addingPoints
    ? "CREATING REQUEST..."
    : "CONTINUE TO PAYMENT →"}
</button>

    </div>
  </div>
)}

{showWithdraw && (
  <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 px-4 pb-5 sm:items-center">

    <div className="w-full max-w-md rounded-[22px] bg-white p-5 shadow-2xl">

      {/* HEADER */}

      <div className="flex items-center justify-between">

        <div>
          <p className="text-[10px] font-black uppercase text-[#888888]">
            Winnings Wallet
          </p>

          <h2 className="mt-1 text-[20px] font-black text-[#111111]">
            Withdraw Money
          </h2>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowWithdraw(false)
          }
          disabled={withdrawing}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eeeeee] text-[16px] font-black text-[#111111]"
        >
          ✕
        </button>

      </div>

      {/* AVAILABLE BALANCE */}

      <div className="mt-4 rounded-[14px] bg-[#111111] p-4">

        <p className="text-[9px] font-bold uppercase text-white/50">
          Available Winnings
        </p>

        <p className="mt-1 text-[26px] font-black text-white">
          ₹{winningsBalance}
        </p>

      </div>

      {/* AMOUNT */}

      <div className="mt-5">

        <label className="text-[9px] font-black uppercase text-[#777777]">
          Withdrawal Amount
        </label>

        <div className="mt-2 flex items-center rounded-[12px] border-2 border-[#dddddd] px-4">

          <span className="text-[17px] font-black text-[#111111]">
            ₹
          </span>

          <input
            type="number"
            min="10"
            step="1"
            max={winningsBalance}
            value={withdrawAmount}
            onChange={(event) =>
              setWithdrawAmount(
                event.target.value
              )
            }
            placeholder="Enter amount"
            className="h-[50px] w-full bg-transparent px-2 text-[16px] font-black text-[#111111] outline-none"
          />

        </div>

        <div className="mt-2 flex justify-between">

          <p className="text-[8px] font-bold text-[#999999]">
            Minimum ₹10
          </p>

          <button
            type="button"
            onClick={() =>
              setWithdrawAmount(
                String(
                  Math.floor(
                    winningsBalance
                  )
                )
              )
            }
            className="text-[8px] font-black text-[#111111]"
          >
            WITHDRAW ALL
          </button>

        </div>

      </div>

      {/* UPI */}

      <div className="mt-5">

        <label className="text-[9px] font-black uppercase text-[#777777]">
          UPI ID
        </label>

        <input
          type="text"
          value={upiId}
          onChange={(event) =>
            setUpiId(
              event.target.value
            )
          }
          placeholder="example@upi"
          autoCapitalize="none"
          autoCorrect="off"
          className="mt-2 h-[50px] w-full rounded-[12px] border-2 border-[#dddddd] px-4 text-[13px] font-bold text-[#111111] outline-none focus:border-[#FFD600]"
        />

      </div>

      {/* INFO */}

      <div className="mt-4 rounded-[12px] bg-[#fff8d7] p-3">

        <p className="text-[9px] font-bold leading-4 text-[#746000]">
          Please check your UPI ID carefully.
          Your request will be reviewed by the admin before payment.
        </p>

      </div>

      {/* ERROR */}

      {withdrawError && (
        <div className="mt-3 rounded-[10px] bg-red-50 px-3 py-2">

          <p className="text-[9px] font-bold text-red-600">
            {withdrawError}
          </p>

        </div>
      )}

      {/* SUBMIT */}

      <button
        type="button"
        onClick={
          handleWithdrawRequest
        }
        disabled={
          withdrawing ||
          !withdrawAmount ||
          Number(withdrawAmount) < 10 ||
          Number(withdrawAmount) >
            winningsBalance ||
          !upiId.trim()
        }
        className="mt-4 w-full rounded-[12px] bg-[#FFD600] py-[14px] text-[11px] font-black text-[#111111] transition active:scale-[0.98] disabled:bg-[#dddddd] disabled:text-[#999999]"
      >
        {withdrawing
          ? "SUBMITTING..."
          : `WITHDRAW ₹${
              withdrawAmount || "0"
            }`}
      </button>

    </div>

  </div>
)}

{showConvert && (
  <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 px-4 pb-5 sm:items-center">

    <div className="w-full max-w-md rounded-[22px] bg-white p-5 shadow-2xl">

      {/* HEADER */}

      <div className="flex items-center justify-between">

        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#888888]">
            MONEY WALLET
          </p>

          <h2 className="mt-1 text-[21px] font-black text-[#111111]">
            Convert Winnings
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setShowConvert(false)}
          disabled={converting}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eeeeee] font-black text-[#111111]"
        >
          ✕
        </button>

      </div>

      {/* BALANCES */}

      <div className="mt-5 grid grid-cols-2 gap-3">

        <div className="rounded-[13px] bg-[#111111] p-4">

          <p className="text-[9px] font-bold text-white/50">
            WINNINGS
          </p>

          <p className="mt-2 text-[23px] font-black text-white">
            ₹{winningsBalance}
          </p>

        </div>

        <div className="rounded-[13px] bg-[#FFD600] p-4">

          <p className="text-[9px] font-bold text-black/50">
            POINTS
          </p>

          <p className="mt-2 text-[23px] font-black text-[#111111]">
            {pointsBalance} P
          </p>

        </div>

      </div>

      {/* AMOUNT */}

      <div className="mt-5">

        <label className="text-[10px] font-black text-[#777777]">
          CONVERSION AMOUNT
        </label>

        <div className="mt-2 flex items-center rounded-[12px] border-2 border-[#dddddd] px-4">

          <span className="text-[18px] font-black text-[#111111]">
            ₹
          </span>

          <input
            type="number"
            min="1"
            step="1"
            max={winningsBalance}
            value={convertAmount}
            onChange={(event) =>
              setConvertAmount(event.target.value)
            }
            placeholder="Enter amount"
            className="h-[52px] w-full bg-transparent px-3 text-[17px] font-black text-[#111111] outline-none"
          />

        </div>

        <button
          type="button"
          onClick={() =>
            setConvertAmount(
              String(Math.floor(winningsBalance))
            )
          }
          className="mt-2 text-[9px] font-black text-[#111111]"
        >
          CONVERT ALL
        </button>

      </div>

      {/* PREVIEW */}

      <div className="mt-5 rounded-[14px] bg-[#fff9db] p-4 text-center">

        <p className="text-[9px] font-black text-[#9b8300]">
          YOU WILL RECEIVE
        </p>

        <p className="mt-2 text-[30px] font-black text-[#111111]">
          {Number(convertAmount) || 0} P
        </p>

        <p className="mt-1 text-[9px] font-bold text-[#9b8300]">
          ₹1 = 1 Point
        </p>

      </div>

      {/* NOTICE */}

      <p className="mt-4 text-center text-[9px] font-medium leading-4 text-[#888888]">
        Converted points can be used for tournaments.
        Points cannot be converted back into cash.
      </p>

      {/* ERROR */}

      {convertError && (
        <p className="mt-3 text-center text-[10px] font-bold text-red-600">
          {convertError}
        </p>
      )}

      {/* SUBMIT */}

      <button
        type="button"
        onClick={handleConvertWinnings}
        disabled={
          converting ||
          !Number.isSafeInteger(Number(convertAmount)) ||
          Number(convertAmount) < 1 ||
          Number(convertAmount) > winningsBalance
        }
        className="mt-5 w-full rounded-[12px] bg-[#FFD600] py-[15px] text-[11px] font-black text-[#111111] transition active:scale-[0.98] disabled:bg-[#dddddd] disabled:text-[#999999]"
      >
        {converting
          ? "CONVERTING..."
          : "CONFIRM CONVERSION →"}
      </button>

    </div>

  </div>
)}

        {/* ============================================
            DATE TABS
        ============================================ */}

        <section className="sticky top-0 z-30 border-b border-[#eeeeee] bg-white px-3 py-3 shadow-[0_3px_10px_rgba(0,0,0,0.05)]">
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            {dateTabs.map(
              (item) => {
                const active =
                  selectedDate ===
                  item.key;

                return (
                  <button
                    key={
                      item.key
                    }
                    type="button"
                    onClick={() =>
                      setSelectedDate(
                        item.key
                      )
                    }
                    className={`shrink-0 rounded-[11px] px-[20px] py-[11px] text-[10px] font-black transition ${
                      active
                        ? "bg-[#FFD600] text-[#111111] shadow-[0_4px_10px_rgba(255,214,0,0.30)]"
                        : "bg-[#f2f2f2] text-[#697080]"
                    }`}
                  >
                    {
                      item.label
                    }
                  </button>
                );
              }
            )}
          </div>
        </section>

        {/* ============================================
            PLAYER CATEGORY TABS
        ============================================ */}
        <section className="border-b border-[#eeeeee] bg-white px-3 py-3">
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            {PLAYER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedPlayerTab(tab.key)}
                aria-pressed={selectedPlayerTab === tab.key}
                className={`shrink-0 rounded-[11px] px-[20px] py-[11px] text-[10px] font-black transition ${
                  selectedPlayerTab === tab.key
                    ? "bg-[#FFD600] text-[#111111] shadow-[0_4px_10px_rgba(255,214,0,0.30)]"
                    : "bg-[#f2f2f2] text-[#697080]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {/* ============================================
            TOURNAMENTS
        ============================================ */}

        {loading ? (
  <div className="flex min-h-[350px] items-center justify-center bg-[#f5f5f5]">
    <div className="text-center">
      <div className="mx-auto h-[34px] w-[34px] animate-spin rounded-full border-[4px] border-[#dddddd] border-t-[#FFD600]" />

      <p className="mt-4 text-[11px] font-black text-[#777777]">
        Loading tournaments...
      </p>
    </div>
  </div>
) : selectedPlayerTab === "1v1" ? (

  /* 1v1 MATCH SECTION */

  <section className="bg-[#f5f5f5] px-4 pb-7 pt-5">

    <div className="mb-4 flex items-center justify-between">
      <PlayerSectionTitle title="1v1 Players" />

      <span className="text-[10px] font-black text-[#777777]">
        HEAD TO HEAD
      </span>
    </div>

    {/* CREATE MATCH CARD */}

    <div className="rounded-[18px] border border-[#e5e5e5] bg-white p-4 shadow-sm">

      <div className="flex items-center gap-3">

        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-[#111111] text-[26px]">
          ⚔️
        </div>

        <div className="flex-1">
          <h2 className="text-[16px] font-black text-[#111111]">
            Create 1v1 Match
          </h2>

          <p className="mt-1 text-[9px] font-semibold text-[#888888]">
            Challenge another eFootball player.
          </p>
        </div>

      </div>

      <div className="mt-4 rounded-[12px] bg-[#fff8d5] p-3">
        <p className="text-[10px] font-bold leading-5 text-[#746000]">
          Create your match request. Admin approval is required
          before other players can join.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          setOneVsOneError("");
          setOneVsOneSuccess("");
          setShowCreate1v1(!showCreate1v1);
        }}
        className="mt-4 w-full rounded-[12px] bg-[#111111] py-[14px] text-[11px] font-black tracking-wide text-[#FFD600]"
      >
        {showCreate1v1 ? "CLOSE FORM" : "+ CREATE MATCH"}
      </button>

      {/* CREATE FORM */}

      {showCreate1v1 && (
        <div className="mt-5 border-t border-[#eeeeee] pt-5">

          <h3 className="text-[13px] font-black text-[#111111]">
            Match Details
          </h3>

          {/* ENTRY FEE */}

          <label className="mt-5 block text-[10px] font-black uppercase text-[#777777]">
            Select Entry Fee
          </label>

          <div className="mt-3 grid grid-cols-4 gap-2">

            {Object.keys(ONE_V_ONE_REWARDS).map((amount) => {
              const active = oneVsOneFee === amount;

              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setOneVsOneFee(amount)}
                  className={`rounded-[10px] border-2 py-3 text-center ${
                    active
                      ? "border-[#111111] bg-[#FFD600] text-[#111111]"
                      : "border-[#eeeeee] bg-white text-[#555555]"
                  }`}
                >
                  <p className="text-[14px] font-black">
                    {amount}
                  </p>

                  <p className="text-[8px] font-bold">
                    POINTS
                  </p>
                </button>
              );
            })}

          </div>

          {/* REWARD */}

          <div className="mt-4 flex items-center justify-between rounded-[12px] bg-[#111111] p-4">

            <div>
              <p className="text-[9px] font-bold text-white/50">
                WINNER REWARD
              </p>

              <p className="mt-1 text-[23px] font-black text-[#FFD600]">
                {ONE_V_ONE_REWARDS[Number(oneVsOneFee)]} P
              </p>
            </div>

            <span className="text-[28px]">🏆</span>

          </div>

          {/* DATE */}

          <label className="mt-5 block text-[10px] font-black uppercase text-[#777777]">
            Match Date
          </label>

          <input
            type="date"
            min={getDateKey(new Date())}
            value={oneVsOneDate}
            onChange={(event) =>
              setOneVsOneDate(event.target.value)
            }
            className="mt-2 h-[46px] w-full rounded-[11px] border border-[#dddddd] bg-white px-3 text-[12px] font-bold text-[#111111] outline-none focus:border-[#FFD600]"
          />

          {/* TIME */}

          <label className="mt-4 block text-[10px] font-black uppercase text-[#777777]">
            Match Time (IST)
          </label>

          <input
            type="time"
            value={oneVsOneTime}
            onChange={(event) =>
              setOneVsOneTime(event.target.value)
            }
            className="mt-2 h-[46px] w-full rounded-[11px] border border-[#dddddd] bg-white px-3 text-[12px] font-bold text-[#111111] outline-none focus:border-[#FFD600]"
          />

          {/* SUMMARY */}

          <div className="mt-5 rounded-[12px] border border-[#eeeeee] p-4">

            <p className="text-[10px] font-black uppercase text-[#777777]">
              Match Summary
            </p>

            <div className="mt-3 flex justify-between">
              <span className="text-[10px] text-[#777777]">
                Your Entry
              </span>

              <span className="text-[11px] font-black text-[#111111]">
                {oneVsOneFee} Points
              </span>
            </div>

            <div className="mt-2 flex justify-between">
              <span className="text-[10px] text-[#777777]">
                Winner Reward
              </span>

              <span className="text-[11px] font-black text-[#16834a]">
                {ONE_V_ONE_REWARDS[Number(oneVsOneFee)]} Points
              </span>
            </div>

            <div className="mt-2 flex justify-between">
              <span className="text-[10px] text-[#777777]">
                Your Balance
              </span>

              <span className="text-[11px] font-black text-[#111111]">
                {pointsBalance} P
              </span>
            </div>

          </div>

          {/* ERROR */}

          {oneVsOneError && (
            <p className="mt-4 rounded-[10px] bg-red-50 p-3 text-[10px] font-bold text-red-600">
              {oneVsOneError}
            </p>
          )}

          {/* SUCCESS */}

          {oneVsOneSuccess && (
            <p className="mt-4 rounded-[10px] bg-green-50 p-3 text-[10px] font-bold text-green-700">
              {oneVsOneSuccess}
            </p>
          )}

          {/* SUBMIT */}

          <button
            type="button"
            onClick={handleCreateOneVsOneMatch}
            disabled={creating1v1}
            className="mt-5 w-full rounded-[12px] bg-[#FFD600] py-[15px] text-[11px] font-black text-[#111111] disabled:opacity-50"
          >
            {creating1v1
              ? "CREATING REQUEST..."
              : "CONFIRM & CREATE MATCH →"}
          </button>

        </div>
      )}

    </div>

    {/* =========================================
    AVAILABLE 1V1 MATCHES
========================================= */}

<div className="mt-6">

  <div className="mb-4 flex items-center justify-between">

    <h2 className="text-[14px] font-black text-[#111111]">
      AVAILABLE MATCHES
    </h2>

    <span className="rounded-full bg-[#FFD600] px-3 py-1 text-[9px] font-black text-[#111111]">
      {availableMatches.filter(
        (match) =>
          match.date === selectedDate &&
          match.hostId !== auth.currentUser?.uid
      ).length} OPEN
    </span>

  </div>

  {joinMatchError && (
    <p className="mb-3 rounded-lg bg-red-50 p-3 text-[10px] font-bold text-red-600">
      {joinMatchError}
    </p>
  )}

  {availableMatches.filter(
    (match) =>
      match.date === selectedDate &&
      match.hostId !== auth.currentUser?.uid
  ).length === 0 ? (

    <div className="rounded-[16px] border border-dashed border-[#cccccc] bg-white p-7 text-center">

      <div className="text-[35px]">
        ⚔️
      </div>

      <p className="mt-3 text-[12px] font-black text-[#111111]">
        No Available Matches
      </p>

      <p className="mt-2 text-[9px] font-medium text-[#888888]">
        No approved 1v1 matches available for this date.
      </p>

    </div>

  ) : (

    <div className="space-y-4">

      {availableMatches
        .filter(
          (match) =>
            match.date === selectedDate &&
            match.hostId !== auth.currentUser?.uid
        )
        .map((match) => (

          <div
            key={match.id}
            className="overflow-hidden rounded-[16px] border border-[#dddddd] bg-white shadow-sm"
          >

            <div className="flex items-center justify-between bg-[#111111] px-4 py-3">

              <span className="text-[11px] font-black text-[#FFD600]">
                ⚔️ 1V1 CHALLENGE
              </span>

              <span className="rounded-full bg-green-500/15 px-3 py-1 text-[8px] font-black text-green-600">
                OPEN
              </span>

            </div>

            <div className="p-4">

              {/* HOST */}

              <div className="flex items-center gap-3">

                <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#fff2b0] text-[20px]">
                  👤
                </div>

                <div className="flex-1">

                  <p className="text-[12px] font-black text-[#111111]">
                    {match.hostName}
                  </p>

                  <p className="text-[9px] font-bold text-[#888888]">
                    MATCH HOST
                  </p>

                </div>

                <span className="text-[11px] font-black text-[#888888]">
                  VS
                </span>

                <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-dashed border-[#cccccc] text-[19px]">
                  ❓
                </div>

              </div>

              {/* MATCH DETAILS */}

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-[12px] bg-[#f5f5f5] p-3">

                <div>
                  <p className="text-[8px] font-bold text-[#999999]">
                    ENTRY FEE
                  </p>

                  <p className="mt-1 text-[14px] font-black text-[#111111]">
                    {match.entryFee} P
                  </p>
                </div>

                <div>
                  <p className="text-[8px] font-bold text-[#999999]">
                    WINNER GETS
                  </p>

                  <p className="mt-1 text-[14px] font-black text-green-600">
                    {match.winnerReward} P
                  </p>
                </div>

                <div>
                  <p className="text-[8px] font-bold text-[#999999]">
                    MATCH TIME
                  </p>

                  <p className="mt-1 text-[11px] font-black text-[#111111]">
                    {formatTime12Hour(match.time)}
                  </p>
                </div>

              </div>

              <p className="mt-3 text-center text-[9px] font-bold text-[#777777]">
                📅 {formatDate(match.date)}
              </p>

              {/* JOIN */}

              <button
                type="button"
                onClick={() =>
                  handleJoinOneVsOneMatch(match)
                }
                disabled={
                  !!joiningMatchId ||
                  pointsBalance < match.entryFee
                }
                className="mt-4 w-full rounded-[11px] bg-[#FFD600] py-[14px] text-[11px] font-black text-[#111111] transition active:scale-[0.98] disabled:bg-[#dddddd] disabled:text-[#999999]"
              >

                {joiningMatchId === match.id
                  ? "JOINING MATCH..."
                  : pointsBalance < match.entryFee
                  ? "INSUFFICIENT POINTS"
                  : "JOIN MATCH →"}

              </button>

            </div>

          </div>

        ))}

    </div>

  )}

</div>

    {/* PENDING INFO */}

    <div className="mt-4 rounded-[13px] border border-[#e5e5e5] bg-white p-4">

      <p className="text-[11px] font-black text-[#111111]">
        How it works
      </p>

      <div className="mt-3 space-y-3 text-[9px] font-semibold text-[#777777]">
        <p>① Create your match request.</p>
        <p>② Admin reviews and approves your request.</p>
        <p>③ Another player joins your match.</p>
        <p>④ Both players' entry fees are deducted after joining.</p>
        <p>⑤ Winner receives the reward after admin verifies the result.</p>
      </div>

    </div>

  </section>

) : (
  <TournamentSection
    key={selectedPlayerTab}
    title={
      PLAYER_TABS.find(
        (tab) => tab.key === selectedPlayerTab
      )?.label || "Players"
    }
    tournaments={selectedPlayerTournaments}
    now={now}
  />
)}

        {/* ============================================
            BOTTOM NAVIGATION
        ============================================ */}

        <BottomNavigation />
      </div>
    </main>
  );
}