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
   CATEGORY CHECK
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
  if (!dateString) {
    return "";
  }

  const parts = dateString.split("-");

  if (parts.length !== 3) {
    return dateString;
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  const date = new Date(year, month - 1, day);

  return date
    .toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .toLowerCase();
}

/* =================================================
   TIME TO MINUTES
   Supports:

   21:00
   21:30
   09:00
   9:00 PM
================================================= */

function timeToMinutes(time: string) {
  if (!time) {
    return 0;
  }

  const clean = time.trim().toUpperCase();

  /* -----------------------------------------------
     24 HOUR FORMAT
  ------------------------------------------------ */

  const twentyFourHourMatch = clean.match(
    /^(\d{1,2}):(\d{2})$/
  );

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

  /* -----------------------------------------------
     12 HOUR FORMAT
  ------------------------------------------------ */

  const twelveHourMatch = clean.match(
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

/* =================================================
   FORMAT TIME
   Firebase 24-hour → UI 12-hour

   21:00 → 9:00 PM
   21:30 → 9:30 PM
   00:00 → 12:00 AM
   12:00 → 12:00 PM
================================================= */

function formatTime12Hour(time: string) {
  if (!time) {
    return "";
  }

  const clean = time.trim().toUpperCase();

  /* -----------------------------------------------
     24 HOUR FORMAT
  ------------------------------------------------ */

  const twentyFourHourMatch = clean.match(
    /^(\d{1,2}):(\d{2})$/
  );

  if (twentyFourHourMatch) {
    let hour = Number(
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

  /* -----------------------------------------------
     ALREADY 12 HOUR
  ------------------------------------------------ */

  const twelveHourMatch = clean.match(
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
   TOURNAMENT EXPIRY
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

  const year = Number(
    dateParts[0]
  );

  const month = Number(
    dateParts[1]
  );

  const day = Number(
    dateParts[2]
  );

  if (
    !year ||
    !month ||
    !day
  ) {
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

  return (
    now >=
    tournamentDateTime
  );
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
    <div className="w-[226px] shrink-0 overflow-hidden rounded-[9px] border border-[#e2e5e8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">

      {/* IMAGE */}

      <div className="relative h-[112px] overflow-hidden bg-[#071426]">

        <img
          src={getTournamentImage(
            tournament.coins
          )}
          alt={`${tournament.coins} Coins Tournament`}
          className="h-full w-full object-cover"
        />

        <div className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[8px] font-black text-[#071426] shadow-sm">
          {tournament.maxPlayers} PLAYERS
        </div>

      </div>

      {/* DATE / TIME */}

      <div className="bg-[#f7f9fa] px-4 py-2">

        <p className="text-[10px] font-black text-[#111827]">
          {formatDate(
            tournament.date
          )}
        </p>

        <p className="mt-1 text-[10px] font-bold text-[#111827]">
          {formatTime12Hour(
            tournament.time
          )}
        </p>

      </div>

      {/* CONTENT */}

      <div className="px-4 pb-3 pt-3">

        <div className="flex items-center">

          <div className="w-1/2 border-r border-[#e5e7eb]">

            <p className="text-[8px] font-medium text-[#8b949e]">
              Entry Fee
            </p>

            <p className="mt-1 text-[11px] font-black text-[#111827]">
              ₹
              {
                tournament.entryFee
              }
            </p>

          </div>

          <div className="w-1/2 pl-3">

            <p className="text-[8px] font-medium text-[#8b949e]">
              Prize Pool
            </p>

            <p className="mt-1 text-[11px] font-black text-[#111827]">
              {
                tournament.coins
              }{" "}
              coin
            </p>

          </div>

        </div>

        {/* PLAYER PROGRESS */}

        <div className="mt-3">

          <div className="h-[5px] overflow-hidden rounded-full bg-[#e4e9ed]">

            <div
              className="h-full rounded-full bg-[#00b85c]"
              style={{
                width: `${percentage}%`,
              }}
            />

          </div>

          <div className="mt-1 flex justify-end">

            <span className="text-[8px] font-bold text-[#737b84]">
              {
                registered
              }{" "}
              /{" "}
              {
                maxPlayers
              }{" "}
              PLAYERS
            </span>

          </div>

        </div>

        {/* JOIN */}

        {isFull ? (

          <button
            type="button"
            disabled
            className="mt-3 w-full rounded-[6px] bg-[#d9dde1] py-[9px] text-[9px] font-black tracking-[0.04em] text-[#7b838b]"
          >
            FULL
          </button>

        ) : (

          <Link
            href={`/tournament/${tournament.id}`}
            className="mt-3 flex w-full items-center justify-center rounded-[6px] bg-[#00b85c] py-[9px] text-[9px] font-black tracking-[0.04em] text-white transition hover:bg-[#009f50] active:scale-[0.98]"
          >
            JOIN NOW
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
      className="h-[34px] min-w-[120px] appearance-auto rounded-[8px] border border-[#d8dde2] bg-white px-3 text-[11px] font-black text-[#111827] outline-none"
    >

      {/* ALL TIMES */}

      <option value="">
        ALL TIMES
      </option>

      {/* TIMES */}

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

  /* -----------------------------------------------
     REMOVE EXPIRED TOURNAMENTS
  ------------------------------------------------ */

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

  /* -----------------------------------------------
     AVAILABLE TIMES
  ------------------------------------------------ */

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

  /* -----------------------------------------------
     EMPTY = ALL TIMES

     Important:
     We DO NOT auto-select first time.
  ------------------------------------------------ */

  const [
    selectedTime,
    setSelectedTime,
  ] = useState("");

  /* -----------------------------------------------
     FILTER

     Empty selectedTime means:
     SHOW ALL TOURNAMENTS
  ------------------------------------------------ */

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
    <section className="bg-[#eeeeee] px-2 pb-4 pt-3">

      {/* SECTION HEADER */}

      <div className="mb-3 flex items-center justify-between px-1">

        <div className="rounded-[8px] border border-[#cfd4d9] bg-white px-4 py-[7px]">

          <h2 className="text-[11px] font-black text-[#111827]">
            {title}
          </h2>

        </div>

        <TimeSelector
          value={selectedTime}
          times={times}
          onChange={
            setSelectedTime
          }
        />

      </div>

      {/* CARDS */}

      <div className="min-h-[280px]">

        {filteredTournaments.length ===
        0 ? (

          <div className="flex min-h-[240px] items-center justify-center rounded-[10px] bg-white">

            <div className="text-center">

              <p className="text-[11px] font-bold text-[#888888]">
                No tournaments available
              </p>

              <p className="mt-1 text-[9px] text-[#a2a8ae]">
                No tournament scheduled for this date and time.
              </p>

            </div>

          </div>

        ) : (

          <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">

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

      </div>

    </section>
  );
}

/* =================================================
   BOTTOM NAV ITEM
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
      className={`flex h-full flex-col items-center justify-center gap-[3px] ${
        active
          ? "text-[#111111]"
          : "text-[#a6a6a6]"
      }`}
    >

      <span className="flex h-[23px] items-center justify-center text-[19px] leading-none">
        {icon}
      </span>

      <span
        className={`text-[8px] leading-[10px] ${
          active
            ? "font-black text-[#111111]"
            : "font-bold text-[#a6a6a6]"
        }`}
      >
        {label}
      </span>

    </button>
  );
}

/* =================================================
   BOTTOM NAVIGATION
================================================= */

function BottomNavigation() {

  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e5e7eb] bg-white">

      <div className="mx-auto grid h-[72px] max-w-md grid-cols-5">

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
   HOME PAGE
================================================= */

export default function HomePage() {

  /* =================================================
     DATE TABS
  ================================================= */

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

  /* =================================================
     CURRENT TIME

     Updates every 30 seconds.
  ================================================= */

  const [now, setNow] =
    useState<Date>(
      () => new Date()
    );

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
     TOURNAMENTS
  ================================================= */

  const [
    tournaments,
    setTournaments,
  ] = useState<Tournament[]>(
    []
  );

  const [
    profilePhoto,
    setProfilePhoto,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

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

          setTournaments(
            []
          );

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
     SELECTED DATE TOURNAMENTS
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
    <main className="min-h-screen bg-[#f1f1f1]">

      <div className="mx-auto min-h-screen max-w-md bg-white pb-[88px] shadow-[0_0_40px_rgba(0,0,0,0.08)]">

        {/* HEADER */}

        <header className="bg-white">

          <div className="flex h-[74px] items-center justify-between px-4">

            {/* LOGO */}
<img
  src="/logo.png"
  alt="eFOOTBALL TOURNAMENTS"
  className="h-[48px] w-[185px] object-contain object-left"
/>

            {/* PROFILE */}

            <Link
              href="/profile"
              className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-full border border-[#e2e5e8] bg-[#f2f4f5]"
            >

              {profilePhoto ? (

                <img
                  src={profilePhoto}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />

              ) : (

                <span className="text-[17px]">
                  👤
                </span>

              )}

            </Link>

          </div>

        </header>

        {/* HERO */}

        <section className="w-full overflow-hidden bg-white">

          <img
            src="/images/hero/banner.png"
            alt="eFootball Tournament"
            className="block h-auto w-full"
          />

        </section>

        {/* DATE TABS */}

        <section className="sticky top-0 z-30 border-b border-[#e6e7e8] bg-white px-2 py-3">

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
                    className={`shrink-0 rounded-[10px] px-[17px] py-[8px] text-[10px] font-black transition ${
                      active
                        ? "bg-[#00b85c] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                        : "bg-[#f1f2f3] text-[#777777]"
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

        {/* TOURNAMENT AREA */}

        {loading ? (

          <div className="bg-[#eeeeee] px-4 py-12 text-center">

            <p className="text-[11px] font-bold text-[#888888]">
              Loading tournaments...
            </p>

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

            <TournamentSection
              title="8 Players"
              tournaments={
                tournaments8
              }
              now={now}
            />

          </>

        )}

        {/* BOTTOM NAV */}

        <BottomNavigation />

      </div>

    </main>
  );
}