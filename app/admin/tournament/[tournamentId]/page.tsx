"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";
import PlayersTab from "./PlayersTab";
import FixtureTab from "./FixtureTab";
import FixtureTab8Players from "./FixtureTab8Players";
import BookingsTab from "./BookingsTab";

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

  roomCode?: string;
  roomCodeA?: string;
  roomCodeB?: string;

  semiFinalRoomCode?: string;

  /**
   * Old field kept only for backward compatibility.
   *
   * New admin UI will NOT use this as a Final room code.
   */
  finalRoomCode?: string;
};

type Tab = "players" | "bookings" | "fixture";

function getTournamentImage(coins: number) {
  return `/images/${coins}.png`;
}

function getTournamentDateTime(
  dateString: string,
  timeString: string
) {
  if (!dateString || !timeString) {
    return null;
  }

  let hour = 0;
  let minute = 0;

  const cleanTime = timeString.trim().toUpperCase();

  /*
   * 24-hour format
   *
   * 08:00
   * 20:00
   * 12:30
   */
  const twentyFourHourMatch = cleanTime.match(
    /^(\d{1,2}):(\d{2})$/
  );

  if (twentyFourHourMatch) {
    hour = Number(twentyFourHourMatch[1]);
    minute = Number(twentyFourHourMatch[2]);

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
    /*
     * 12-hour format
     *
     * 8:00 AM
     * 8 PM
     * 12:30 PM
     */
    const twelveHourMatch = cleanTime.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/
    );

    if (!twelveHourMatch) {
      console.error(
        "Invalid tournament time:",
        timeString
      );

      return null;
    }

    hour = Number(twelveHourMatch[1]);
    minute = Number(
      twelveHourMatch[2] || 0
    );

    const period = twelveHourMatch[3];

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

    if (period === "AM" && hour === 12) {
      hour = 0;
    }

    if (period === "PM" && hour !== 12) {
      hour += 12;
    }
  }

  /*
   * Date format:
   *
   * YYYY-MM-DD
   */
  const dateMatch = dateString
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!dateMatch) {
    console.error(
      "Invalid tournament date:",
      dateString
    );

    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  /*
   * Tournament time is treated as IST.
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

function getISTDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getCalendarDayDifference(
  tournamentDate: string
) {
  const today = getISTDateString(new Date());

  const todayDate = new Date(
    `${today}T00:00:00`
  );

  const tournamentDay = new Date(
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

function formatTodayCountdown(
  milliseconds: number
) {
  if (milliseconds <= 0) {
    return "Started";
  }

  const totalSeconds = Math.floor(
    milliseconds / 1000
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds =
    totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) =>
      String(value).padStart(2, "0")
    )
    .join(":");
}

function formatTournamentCountdown(
  tournament: Tournament,
  now: number
) {
  const target = getTournamentDateTime(
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

  /*
   * Today
   */
  if (dayDifference === 0) {
    return formatTodayCountdown(
      difference
    );
  }

  /*
   * Tomorrow
   */
  if (dayDifference === 1) {
    return "1 Day";
  }

  /*
   * Future dates
   */
  if (dayDifference > 1) {
    return `${dayDifference} Days`;
  }

  return "Started";
}

export default function AdminTournamentManagePage() {
  const params = useParams();
  const router = useRouter();

  const tournamentId =
    typeof params.tournamentId === "string"
      ? params.tournamentId
      : "";

  const [tournament, setTournament] =
    useState<Tournament | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [checkingAdmin, setCheckingAdmin] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState<Tab>("players");

  const [countdown, setCountdown] =
    useState("--:--:--");

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            router.replace(
              `/login?redirect=/admin/tournament/${tournamentId}`
            );

            return;
          }

          try {
            const adminRef = doc(
              db,
              "admins",
              user.uid
            );

            const adminSnapshot =
              await getDoc(adminRef);

            if (!adminSnapshot.exists()) {
              router.replace("/");
              return;
            }

            setCheckingAdmin(false);
          } catch (error) {
            console.error(
              "Admin check failed:",
              error
            );

            router.replace("/");
          }
        }
      );

    return () => unsubscribe();
  }, [
    router,
    tournamentId,
  ]);

  /*
   * Load tournament
   */
  useEffect(() => {
    if (
      !tournamentId ||
      checkingAdmin
    ) {
      return;
    }

    let cancelled = false;

    async function loadTournament() {
      try {
        setLoading(true);

        const tournamentRef = doc(
          db,
          "tournaments",
          tournamentId
        );

        const snapshot =
          await getDoc(tournamentRef);

        if (!snapshot.exists()) {
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

            entryFee: Number(
              data.entryFee || 0
            ),

            registeredPlayers: Number(
              data.registeredPlayers || 0
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
              data.roomCodeA || "",

            roomCodeB:
              data.roomCodeB || "",

            /*
             * New field
             */
            semiFinalRoomCode:
              data.semiFinalRoomCode ||
              "",

            /*
             * Old field only kept
             * for compatibility.
             */
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
  }, [
    tournamentId,
    checkingAdmin,
  ]);

  /*
   * Countdown
   */
  useEffect(() => {
    if (!tournament) {
      return;
    }

    const updateCountdown = () => {
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

  /*
   * If tournament is changed
   * by PlayersTab / FixtureTab,
   * they can later call this callback
   * to update the header immediately.
   */
  function handleTournamentUpdated(
    updatedTournament?: Partial<Tournament>
  ) {
    if (!updatedTournament) {
      return;
    }

    setTournament(
      (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          ...updatedTournament,
        };
      }
    );
  }

  if (
    checkingAdmin ||
    loading
  ) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto min-h-screen max-w-md bg-white">
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#4bd17b] border-t-transparent" />
          </div>
        </div>
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-white px-6">
          <div className="text-center">
            <h1 className="text-[22px] font-black text-[#111111]">
              Tournament not found
            </h1>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/admin"
                )
              }
              className="mt-5 rounded-[9px] bg-[#4bd17b] px-6 py-3 text-[16px] font-black text-[#111111]"
            >
              Back to Admin
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-white pb-[30px] shadow-[0_0_40px_rgba(0,0,0,0.08)]">
        {/* Tournament image */}
        <div className="relative w-full overflow-hidden bg-[#f4f4f4]">
          <img
            src={getTournamentImage(
              tournament.coins
            )}
            alt={`${tournament.coins} coins tournament`}
            className="block h-auto w-full object-cover"
          />

          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[20px] font-black text-[#111111] shadow"
            aria-label="Go back"
          >
            ‹
          </button>

          {/* Admin badge */}
          <div className="absolute right-3 top-3 rounded-full bg-[#111111]/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white">
            Admin
          </div>
        </div>

        {/* Main details */}
        <div className="px-3 pt-3">
          <div className="rounded-[18px] bg-white">
            {/* Time */}
            <div className="text-center">
              <div className="text-[29px] font-black leading-none text-[#111111]">
                {tournament.time}
              </div>
            </div>

            {/* Fee / countdown / prize */}
            <div className="mt-4 grid grid-cols-3 items-center">
              {/* Entry Fee */}
              <div className="text-center">
                <div className="text-[13px] font-bold text-[#888888]">
                  Entry Fee
                </div>

                <div className="mt-1 text-[22px] font-black leading-none text-[#111111]">
                  ₹
                  {tournament.entryFee}
                </div>
              </div>

              {/* Countdown */}
              <div className="text-center">
                <div className="text-[11px] font-bold text-[#999999]">
                  Starts in
                </div>

                <div className="mt-1 whitespace-nowrap text-[18px] font-black leading-none text-[#111111]">
                  {countdown}
                </div>
              </div>

              {/* Prize */}
              <div className="text-center">
                <div className="text-[13px] font-bold text-[#888888]">
                  Prize
                </div>

                <div className="mt-1 flex items-center justify-center gap-1 text-[21px] font-black leading-none text-[#111111]">
                  <span>🪙</span>

                  <span>
                    {tournament.coins}
                  </span>
                </div>
              </div>
            </div>

            {/* Players count */}
            <div className="mt-4 flex justify-center">
              <div className="rounded-full bg-[#f0f0f0] px-4 py-1 text-[12px] font-black text-[#555555]">
                {
                  tournament.registeredPlayers
                }{" "}
                /{" "}
                {
                  tournament.maxPlayers
                }{" "}
                Players
              </div>
            </div>

            {/* Admin Tabs */}
<div className="mt-5 grid grid-cols-3 border-b border-[#e8e8e8]">
  <TabButton
    label="Players"
    active={activeTab === "players"}
    onClick={() => setActiveTab("players")}
  />

  <TabButton
    label="Bookings"
    active={activeTab === "bookings"}
    onClick={() => setActiveTab("bookings")}
  />

  <TabButton
    label="Fixture"
    active={activeTab === "fixture"}
    onClick={() => setActiveTab("fixture")}
  />
</div>

{/* Tab Content */}
<div className="pt-4">
  {activeTab === "players" && (
    <PlayersTab
      tournament={tournament}
      onTournamentUpdated={handleTournamentUpdated}
    />
  )}

  {activeTab === "bookings" && (
    <BookingsTab
      tournamentId={tournamentId}
      tournament={tournament}
      onTournamentUpdated={handleTournamentUpdated}
    />
  )}

  {activeTab === "fixture" &&
    (tournament.maxPlayers === 8 ? (
      <FixtureTab8Players
        tournament={tournament}
        onTournamentUpdated={handleTournamentUpdated}
      />
    ) : (
      <FixtureTab
        tournament={tournament}
        onTournamentUpdated={handleTournamentUpdated}
      />
    ))}
</div>
          </div>
        </div>
      </div>
    </main>
  );
}

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
      className={`relative h-[43px] text-[15px] font-black ${
        active
          ? "text-[#111111]"
          : "text-[#aaaaaa]"
      }`}
    >
      {label}

      {active && (
        <span className="absolute bottom-[-1px] left-[18%] right-[18%] h-[3px] rounded-full bg-[#4bd17b]" />
      )}
    </button>
  );
}