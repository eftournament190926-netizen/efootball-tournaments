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
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

/* =================================================
   TYPES
================================================= */

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

function getTournamentImage(coins: number) {
  return `/images/${coins}.png`;
}

/* =================================================
   CATEGORY
================================================= */

function isSixteenPlayer(tournament: Tournament) {
  if (tournament.maxPlayers === 16) {
    return true;
  }

  const category = String(tournament.category || "")
    .toLowerCase()
    .replace(/\s/g, "");

  return (
    category.includes("16") ||
    category.includes("sixteen")
  );
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
      {/* IMAGE */}

      <div className="relative h-[124px] overflow-hidden bg-[#111111]">
        <img
          src={getTournamentImage(
            tournament.coins
          )}
          alt={`${tournament.coins} Coins Tournament`}
          className="h-full w-full object-cover"
        />

        <div className="absolute left-3 top-3 rounded-[8px] bg-[#FFD600] px-3 py-[6px] text-[9px] font-black text-[#111111] shadow-md">
          {maxPlayers} PLAYERS
        </div>
      </div>

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
              {tournament.coins}
            </p>

            <p className="text-[8px] font-black text-[#087A43]">
              COINS
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
            href={`/tournament/${tournament.id}`}
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
  const visibleTournaments =
    useMemo(() => {
      return tournaments.filter(
        (tournament) =>
          !isTournamentExpired(
            tournament,
            now
          )
      );
    }, [
      tournaments,
      now,
    ]);

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

export default function HomePage() {
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
          "tournaments"
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

  /* =================================================
     PROFILE PHOTO
  ================================================= */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,

        async (user) => {
          if (!user) {
            setProfilePhoto("");
            return;
          }

          try {
            const userSnap =
              await getDoc(
                doc(
                  db,
                  "users",
                  user.uid
                )
              );

            if (
              userSnap.exists()
            ) {
              const data =
                userSnap.data();

              setProfilePhoto(
                data.profilePhoto ||
                  ""
              );
            }
          } catch (error) {
            console.error(
              "Error loading profile photo:",
              error
            );
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
      return tournaments.filter(
        (tournament) =>
          tournament.date ===
            selectedDate &&
          tournament.status !==
            "cancelled" &&
          tournament.status !==
            "completed"
      );
    }, [
      tournaments,
      selectedDate,
    ]);

  /* =================================================
     16 PLAYER
  ================================================= */

  const tournaments16 =
    useMemo(() => {
      return selectedDateTournaments.filter(
        (tournament) =>
          isSixteenPlayer(
            tournament
          )
      );
    }, [
      selectedDateTournaments,
    ]);

  /* =================================================
     8 PLAYER
  ================================================= */

  const tournaments8 =
    useMemo(() => {
      return selectedDateTournaments.filter(
        (tournament) =>
          !isSixteenPlayer(
            tournament
          )
      );
    }, [
      selectedDateTournaments,
    ]);

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

      {/* COIN - ACTIVE ON HOME PAGE */}
      <Link
        href="/"
        className="flex h-[34px] w-[42px] items-center justify-center rounded-full bg-[#FFD600] text-[17px] transition active:scale-95"
        aria-label="Coin tournaments"
      >
        🪙
      </Link>

      {/* MONEY */}
      <Link
        href="/money"
        className="flex h-[34px] w-[42px] items-center justify-center rounded-full text-[17px] transition active:scale-95"
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
            HERO
        ============================================ */}

        <section className="w-full overflow-hidden bg-white">
          <img
            src="/images/hero/banner.png"
            alt="eFootball Tournament"
            className="block h-auto w-full"
          />
        </section>

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
        ) : (
          <>
            <TournamentSection
              title="16 Players"
              tournaments={
                tournaments16
              }
              now={now}
            />

            <div className="h-[1px] bg-[#e8e8e8]" />

            <TournamentSection
              title="8 Players"
              tournaments={
                tournaments8
              }
              now={now}
            />
          </>
        )}

        {/* ============================================
            BOTTOM NAVIGATION
        ============================================ */}

        <BottomNavigation />
      </div>
    </main>
  );
}