"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

import { auth, db } from "@/lib/firebase";
import PlayersTab from "./PlayersTab";
import FixtureTab from "./FixtureTab";
import FixtureTab8Players from "./FixtureTab8Players";

/* =================================================
   TYPES
================================================= */

type Tournament = {
  id: string;
  coins: number;
  cashPrize?: number;
  entryFee: number;
  registeredPlayers: number;
  maxPlayers: number;
  category: string;
  date: string;
  time: string;
  status: string;

  roomCode?: string;
  roomCodeA?: string;
  roomCodeB?: string;
  finalRoomCode?: string;
};

type Tab = "rules" | "players" | "fixture";

/* =================================================
   TOURNAMENT IMAGE
================================================= */

function getTournamentImage(coins: number) {
  return `/images/${coins}.png`;
}

/* =================================================
   TOURNAMENT DATE / TIME
================================================= */

function getTournamentDateTime(
  dateString: string,
  timeString: string
) {
  if (!dateString || !timeString) {
    return null;
  }

  let hour = 0;
  let minute = 0;

  const cleanTime = timeString
    .trim()
    .toUpperCase();

  /* 24-HOUR FORMAT */

  const twentyFourHourMatch =
    cleanTime.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (twentyFourHourMatch) {
    hour = Number(
      twentyFourHourMatch[1]
    );

    minute = Number(
      twentyFourHourMatch[2]
    );

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      console.error(
        "Invalid tournament time:",
        timeString
      );

      return null;
    }
  } else {
    /* 12-HOUR FORMAT */

    const twelveHourMatch =
      cleanTime.match(
        /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/
      );

    if (!twelveHourMatch) {
      console.error(
        "Invalid tournament time:",
        timeString
      );

      return null;
    }

    hour = Number(
      twelveHourMatch[1]
    );

    minute = Number(
      twelveHourMatch[2] || 0
    );

    const period =
      twelveHourMatch[3];

    if (
      hour < 1 ||
      hour > 12 ||
      minute < 0 ||
      minute > 59
    ) {
      console.error(
        "Invalid tournament time:",
        timeString
      );

      return null;
    }

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
  }

  /* DATE */

  const dateMatch = dateString
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!dateMatch) {
    console.error(
      "Invalid tournament date:",
      dateString
    );

    return null;
  }

  const year = Number(
    dateMatch[1]
  );

  const month = Number(
    dateMatch[2]
  );

  const day = Number(
    dateMatch[3]
  );

  /*
   * Tournament time = IST
   */

  const utcTime =
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    ) -
    5.5 * 60 * 60 * 1000;

  return new Date(utcTime);
}

/* =================================================
   IST DATE
================================================= */

function getISTDateString(
  date: Date
) {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(date);
}

/* =================================================
   CALENDAR DIFFERENCE
================================================= */

function getCalendarDayDifference(
  tournamentDate: string
) {
  const today =
    getISTDateString(
      new Date()
    );

  const todayDate =
    new Date(
      `${today}T00:00:00`
    );

  const tournamentDay =
    new Date(
      `${tournamentDate}T00:00:00`
    );

  const difference =
    tournamentDay.getTime() -
    todayDate.getTime();

  return Math.round(
    difference /
      (24 * 60 * 60 * 1000)
  );
}

/* =================================================
   TODAY COUNTDOWN
================================================= */

function formatTodayCountdown(
  milliseconds: number
) {
  if (milliseconds <= 0) {
    return "Started";
  }

  const totalSeconds =
    Math.floor(
      milliseconds / 1000
    );

  const hours =
    Math.floor(
      totalSeconds / 3600
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
        60
    );

  const seconds =
    totalSeconds % 60;

  return [
    hours,
    minutes,
    seconds,
  ]
    .map((value) =>
      String(value).padStart(
        2,
        "0"
      )
    )
    .join(":");
}

/* =================================================
   TOURNAMENT COUNTDOWN
================================================= */

function formatTournamentCountdown(
  tournament: Tournament,
  now: number
) {
  const target =
    getTournamentDateTime(
      tournament.date,
      tournament.time
    );

  if (!target) {
    return "--:--:--";
  }

  const dayDifference =
    getCalendarDayDifference(
      tournament.date
    );

  const difference =
    target.getTime() - now;

  /* TODAY */

  if (dayDifference === 0) {
    return formatTodayCountdown(
      difference
    );
  }

  /* TOMORROW */

  if (dayDifference === 1) {
    return "1 Day";
  }

  /* FUTURE */

  if (dayDifference > 1) {
    return `${dayDifference} Days`;
  }

  return "Started";
}

/* =================================================
   PAGE
================================================= */

export default function TournamentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams =
    useSearchParams();

  const fromMyTournaments =
    searchParams.get("from") ===
    "my-tournaments";

  const tournamentId =
    typeof params.tournamentId ===
    "string"
      ? params.tournamentId
      : "";

  const [
    tournament,
    setTournament,
  ] =
    useState<Tournament | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<Tab>("rules");

  const [
    countdown,
    setCountdown,
  ] =
    useState("--:--:--");

  const [
    isLoggedIn,
    setIsLoggedIn,
  ] = useState(false);

  const [
    joining,
    setJoining,
  ] = useState(false);

  /* =================================================
     LOAD TOURNAMENT
  ================================================= */

  useEffect(() => {
    if (!tournamentId) {
      return;
    }

    let cancelled = false;

    async function loadTournament() {
      try {
        setLoading(true);

        const tournamentRef =
          doc(
            db,
            "tournaments",
            tournamentId
          );

        const snapshot =
          await getDoc(
            tournamentRef
          );

        if (
          !snapshot.exists()
        ) {
          if (!cancelled) {
            setTournament(null);
          }

          return;
        }

        const data =
          snapshot.data();

        const loadedTournament: Tournament =
          {
            id: snapshot.id,

            coins: Number(
              data.coins || 0
            ),

            cashPrize: Number(data.cashPrize || 0),

            entryFee: Number(
              data.entryFee || 0
            ),

            registeredPlayers:
              Number(
                data.registeredPlayers ||
                  0
              ),

            maxPlayers: Number(
              data.maxPlayers || 0
            ),

            category:
              data.category || "",

            date:
              data.date || "",

            time:
              data.time || "",

            status:
              data.status ||
              "upcoming",

            roomCode:
              data.roomCode || "",

            roomCodeA:
              data.roomCodeA ||
              "",

            roomCodeB:
              data.roomCodeB ||
              "",

            finalRoomCode:
              data.finalRoomCode ||
              "",
          };

        if (!cancelled) {
          setTournament(
            loadedTournament
          );
        }
      } catch (error) {
        console.error(
          "Failed to load tournament:",
          error
        );

        if (!cancelled) {
          setTournament(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTournament();

    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  /* =================================================
     AUTH
  ================================================= */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          setIsLoggedIn(
            !!user
          );
        }
      );

    return () =>
      unsubscribe();
  }, []);

  /* =================================================
     COUNTDOWN
  ================================================= */

  useEffect(() => {
    if (!tournament) {
      return;
    }

    const updateCountdown =
      () => {
        setCountdown(
          formatTournamentCountdown(
            tournament,
            Date.now()
          )
        );
      };

    updateCountdown();

    const interval =
      window.setInterval(
        updateCountdown,
        1000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [tournament]);

  /* =================================================
     FULL
  ================================================= */

  const isFull =
    useMemo(() => {
      if (!tournament) {
        return false;
      }

      return (
        tournament.registeredPlayers >=
        tournament.maxPlayers
      );
    }, [tournament]);

  /* =================================================
     CLOSED
  ================================================= */

  const isClosed =
    useMemo(() => {
      if (!tournament) {
        return true;
      }

      const status =
        tournament.status.toLowerCase();

      return (
        status === "cancelled" ||
        status === "completed" ||
        status === "closed"
      );
    }, [tournament]);

  /* =================================================
     JOIN
  ================================================= */

  async function handleJoin() {
    if (
      !tournament ||
      joining
    ) {
      return;
    }

    if (
      isFull ||
      isClosed
    ) {
      return;
    }

    setJoining(true);

    try {
      /*
       * LOGIN FIRST
       */

      if (!isLoggedIn) {
        const redirectUrl =
          `/tournament/join?tournamentId=${encodeURIComponent(
            tournament.id
          )}`;

        router.push(
          `/login?redirect=${encodeURIComponent(
            redirectUrl
          )}`
        );

        return;
      }

      /*
       * JOIN PAGE
       */

      router.push(
        `/tournament/join?tournamentId=${encodeURIComponent(
          tournament.id
        )}`
      );
    } finally {
      setJoining(false);
    }
  }

  /* =================================================
     LOADING
  ================================================= */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto min-h-screen max-w-md bg-white">
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-[4px] border-[#eeeeee] border-t-[#FFD600]" />
          </div>
        </div>
      </main>
    );
  }

  /* =================================================
     NOT FOUND
  ================================================= */

  if (!tournament) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-white px-6">
          <div className="text-center">
            <div className="mx-auto flex h-[70px] w-[70px] items-center justify-center rounded-full bg-[#FFF5BE] text-[32px]">
              🏆
            </div>

            <h1 className="mt-5 text-[22px] font-black text-[#111111]">
              Tournament not found
            </h1>

            <button
              type="button"
              onClick={() =>
                router.push("/")
              }
              className="mt-6 rounded-[12px] bg-[#FFD600] px-7 py-3 text-[15px] font-black text-[#111111] shadow-md"
            >
              GO HOME
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* =================================================
     UI
  ================================================= */

  return (
    <main className="min-h-screen bg-[#e9e9e9]">
      <div className="mx-auto min-h-screen max-w-md bg-white pb-[96px] shadow-[0_0_40px_rgba(0,0,0,0.10)]">

        {/* ==========================================
            YELLOW HEADER
        ========================================== */}

        <header className="bg-[#FFD600]">
          <div className="relative flex h-[74px] items-center justify-center px-4">

            {/* BACK */}

            <button
              type="button"
              onClick={() =>
                router.back()
              }
              aria-label="Go back"
              className="absolute left-4 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#111111] text-[29px] font-black leading-none text-white shadow-md transition active:scale-95"
            >
              ‹
            </button>

            {/* LOGO */}

            <Link
              href="/"
              className="flex items-center justify-center"
            >
              <img
                src="/logo.png"
                alt="eFOOTBALL TOURNAMENTS"
                className="h-[48px] w-[210px] object-contain"
              />
            </Link>
          </div>
        </header>

        {/* ==========================================
            TOURNAMENT BANNER
        ========================================== */}

        <section className="w-full overflow-hidden bg-[#111111]">
          <img
            src={getTournamentImage(
              tournament.coins
            )}
            alt={`${tournament.coins} coins tournament`}
            className="block h-auto w-full object-cover"
          />
        </section>

        {/* ==========================================
            MAIN DETAILS
        ========================================== */}

        <section className="bg-white px-4 pt-5">

          {/* TIME */}

          <div className="text-center">
            <div className="text-[34px] font-black leading-none tracking-[-1px] text-[#050505]">
              {tournament.time}
            </div>
          </div>

          {/* ========================================
              ENTRY / COUNTDOWN / PRIZE
          ======================================== */}

          <div className="mt-6 grid grid-cols-3 items-center">

            {/* ENTRY */}

            <div className="border-r border-[#d6d6d6] px-1 text-center">
              <div className="text-[13px] font-medium text-[#777777]">
                Entry Fee
              </div>

              <div className="mt-[5px] text-[23px] font-black leading-none text-[#050505]">
                ₹
                {
                  tournament.entryFee
                }
              </div>
            </div>

            {/* COUNTDOWN */}

            <div className="border-r border-[#d6d6d6] px-1 text-center">
              <div className="text-[12px] font-medium text-[#777777]">
                Starts in
              </div>

              <div className="mt-[5px] whitespace-nowrap text-[18px] font-black leading-none text-[#050505]">
                {countdown}
              </div>
            </div>

            {/* PRIZE */}

            <div className="px-1 text-center">
              <div className="text-[13px] font-medium text-[#777777]">
                Prize
              </div>

              <div className="mt-[4px] flex items-center justify-center gap-[6px]">

                <span className="flex h-[25px] w-[25px] items-center justify-center rounded-full bg-[#FFD600] text-[13px] shadow-sm">
                  🪙
                </span>

                <span className="text-[23px] font-black leading-none text-[#050505]">
                  {
                    tournament.coins
                  }
                </span>

              </div>
            </div>
          </div>

          {/* ========================================
              PLAYER COUNT
          ======================================== */}

          <div className="mt-6 flex justify-center">
            <div className="flex min-w-[190px] items-center justify-center gap-[7px] rounded-full bg-[#111111] px-5 py-[9px] shadow-[0_3px_8px_rgba(0,0,0,0.18)]">

              <span className="text-[17px] leading-none">
                👥
              </span>

              <span className="text-[14px] font-black text-[#FFD600]">
                {
                  tournament.registeredPlayers
                }
              </span>

              <span className="text-[14px] font-black text-white">
                /
              </span>

              <span className="text-[14px] font-black text-white">
                {
                  tournament.maxPlayers
                }{" "}
                Players
              </span>

            </div>
          </div>

          {/* ========================================
              TABS
          ======================================== */}

          <div className="mt-6 grid grid-cols-3 border-b border-[#dddddd]">

            <TabButton
              label="Rules"
              active={
                activeTab ===
                "rules"
              }
              onClick={() =>
                setActiveTab(
                  "rules"
                )
              }
            />

            <TabButton
              label="Players"
              active={
                activeTab ===
                "players"
              }
              onClick={() =>
                setActiveTab(
                  "players"
                )
              }
            />

            <TabButton
              label="Fixture"
              active={
                activeTab ===
                "fixture"
              }
              onClick={() =>
                setActiveTab(
                  "fixture"
                )
              }
            />

          </div>
        </section>

        {/* ==========================================
            TAB CONTENT
        ========================================== */}

        <section className="bg-white">

          {/* RULES */}

          {activeTab ===
            "rules" && (
            <RulesTab />
          )}

          {/* PLAYERS */}

          {activeTab ===
            "players" && (
            <PlayersTab
              tournament={
                tournament
              }
            />
          )}

          {/* FIXTURE */}

          {activeTab ===
            "fixture" &&
            (tournament.maxPlayers ===
            8 ? (
              <FixtureTab8Players
                tournament={
                  tournament
                }
              />
            ) : (
              <FixtureTab
                tournament={
                  tournament
                }
              />
            ))}

        </section>
      </div>

      {/* ============================================
          BOTTOM JOIN BAR
      ============================================ */}

      {!fromMyTournaments && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0A0A0A] px-4 pb-[16px] pt-[13px] shadow-[0_-5px_20px_rgba(0,0,0,0.18)]">

          <div className="mx-auto max-w-md">

            <button
              type="button"
              disabled={
                isFull ||
                isClosed ||
                joining
              }
              onClick={
                handleJoin
              }
              className={`w-full rounded-[13px] py-[15px] text-[20px] font-black leading-none shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition active:scale-[0.98] ${
                isFull ||
                isClosed
                  ? "cursor-not-allowed bg-[#444444] text-[#999999]"
                  : "bg-[#FFD600] text-[#050505] hover:bg-[#ffdf33]"
              }`}
            >

              {joining
                ? "Please wait..."
                : isClosed
                ? "CLOSED"
                : isFull
                ? "FULL"
                : "Tap to Join"}

            </button>
          </div>
        </div>
      )}

    </main>
  );
}

/* =================================================
   TAB BUTTON
================================================= */

function TabButton({
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
      className={`relative h-[54px] text-[16px] font-black transition ${
        active
          ? "text-[#111111]"
          : "text-[#aaaaaa]"
      }`}
    >
      {label}

      {active && (
        <span className="absolute bottom-[-1px] left-[13%] right-[13%] h-[4px] rounded-t-full bg-[#FFD600]" />
      )}
    </button>
  );
}

/* =================================================
   RULES
================================================= */

function RulesTab() {
  return (
    <div className="px-5 pb-8 pt-6">

      <h2 className="text-[21px] font-black text-[#111111]">
        Tournament Rules
      </h2>

      <div className="mt-3">

        <Rule
          number="1"
          text="Players must join the tournament before the registration closes."
        />

        <Rule
          number="2"
          text="Use your registered eFootball username while playing the match."
        />

        <Rule
          number="3"
          text="The match room code will be provided after the tournament starts."
        />

        <Rule
          number="4"
          text="Players must enter the match room on time."
        />

        <Rule
          number="5"
          text="If a player does not join the match within the given time, the opponent may receive a walkover."
        />

        <Rule
          number="6"
          text="Any unfair play or cheating can result in disqualification."
          last
        />

      </div>
    </div>
  );
}

/* =================================================
   RULE
================================================= */

function Rule({
  number,
  text,
  last = false,
}: {
  number: string;
  text: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex gap-4 py-[14px] ${
        !last
          ? "border-b border-[#eeeeee]"
          : ""
      }`}
    >

      {/* NUMBER */}

      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#FFD600] text-[15px] font-black text-[#111111]">
        {number}
      </div>

      {/* RULE TEXT */}

      <p className="pt-[4px] text-[14px] font-medium leading-[1.55] text-[#444444]">
        {text}
      </p>

    </div>
  );
}