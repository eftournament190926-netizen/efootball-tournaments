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

/* =========================================================
   TYPES
========================================================= */

type Registration = {
  id: string;
  userId: string;
  tournamentId: string;
  tournamentPoints?: number;
  category?: string;
  date?: string;
  time?: string;
  entryFee?: number;
  rewardCoins?: number;
  status?: string;
  createdAt?: {
    seconds?: number;
  };
};

type Tournament = {
  id: string;
  points: number;
  image: string;
  description: string;

  date: string;
  time: string;

  category: string;

  players: number;
  entryFee: number;
  rewardCoins: number;

  status: string;

  registeredPlayers: number;
  maxPlayers: number;

  scores?: Record<
    string,
    {
      p1Score: number;
      p2Score: number;
    }
  >;

  matchPlayers?: Record<
    string,
    {
      player1Id: string;
      player2Id: string;
    }
  >;
};

/* =========================================================
   HELPERS
========================================================= */

function getTournamentImage(points: number) {
  return `/images/${points}.png`;
}

function formatDate(dateString: string) {
  if (!dateString) {
    return "";
  }

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
  if (!time) {
    return "";
  }

  return time;
}

function getCountdown(date: string, time: string) {
  if (!date || !time) {
    return "";
  }

  const tournamentDate = new Date(
    `${date}T${convertTimeTo24Hour(time)}:00`,
  );

  if (Number.isNaN(tournamentDate.getTime())) {
    return "";
  }

  const now = new Date();

  const difference =
    tournamentDate.getTime() - now.getTime();

  if (difference <= 0) {
    return "Started";
  }

  const totalMinutes = Math.floor(
    difference / (1000 * 60),
  );

  const days = Math.floor(totalMinutes / 1440);

  if (days === 0) {
    const hours = Math.floor(totalMinutes / 60);

    if (hours > 0) {
      return `${hours} Hours`;
    }

    return `${Math.max(totalMinutes, 1)} Min`;
  }

  if (days === 1) {
    return "Tomorrow";
  }

  return `${days} Days`;
}

function convertTimeTo24Hour(time: string) {
  const value = time.trim();

  const match = value.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i,
  );

  if (!match) {
    return value;
  }

  let hour = Number(match[1]);

  const minute = match[2] || "00";

  const period = match[3].toUpperCase();

  if (period === "PM" && hour !== 12) {
    hour += 12;
  }

  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function isTournamentPlayed(
  tournament: Tournament,
  userId: string,
) {
  if (!tournament.matchPlayers) {
    return false;
  }

  if (!tournament.scores) {
    return false;
  }

  for (const matchId of Object.keys(
    tournament.matchPlayers,
  )) {
    const match =
      tournament.matchPlayers[matchId];

    const score =
      tournament.scores[matchId];

    if (!match || !score) {
      continue;
    }

    if (
      match.player1Id === userId ||
      match.player2Id === userId
    ) {
      return true;
    }
  }

  return false;
}

/* =========================================================
   BOTTOM NAVIGATION
========================================================= */

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
          onClick={() =>
            router.push("/my-tournaments")
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
            router.push("/leaderboard")
          }
        />

        <BottomNavItem
          icon="👤"
          label="Profile"
          onClick={() =>
            router.push("/profile")
          }
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
        active
          ? "text-[#FFD600]"
          : "text-[#777777]"
      }`}
    >
      <span
        className={`flex h-[23px] items-center justify-center text-[19px] leading-none transition ${
          active
            ? ""
            : "grayscale opacity-35"
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

/* =========================================================
   TOURNAMENT CARD
========================================================= */

function TournamentCard({
  tournament,
  userId,
  onOpen,
}: {
  tournament: Tournament;
  userId: string;
  onOpen: () => void;
}) {
  const registered = Number(
    tournament.registeredPlayers || 0,
  );

  const maxPlayers = Number(
    tournament.maxPlayers ||
      tournament.players ||
      0,
  );

  const percentage =
    maxPlayers > 0
      ? Math.min(
          (registered / maxPlayers) * 100,
          100,
        )
      : 0;

  const played = isTournamentPlayed(
    tournament,
    userId,
  );

  const image =
    tournament.image ||
    getTournamentImage(tournament.points);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-[340px] shrink-0 overflow-hidden rounded-[20px] border border-[#d9d9d9] bg-white text-left shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition active:scale-[0.99]"
    >
      {/* IMAGE */}

      <div className="relative w-full overflow-hidden bg-white">
        <img
          src={image}
          alt={`Tournament ${tournament.points}`}
          className="block h-auto w-full"
        />

        <div className="absolute left-3 top-3 rounded-full bg-[#111111] px-3 py-[6px] text-[9px] font-black uppercase tracking-[0.08em] text-[#FFD600]">
          eFootball
        </div>
      </div>

      {/* DETAILS */}

      <div className="px-5 pb-5 pt-4">
        {/* DATE / COUNTDOWN */}

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
              {getCountdown(
                tournament.date,
                tournament.time,
              )}
            </p>
          </div>
        </div>

        {/* INFO */}

        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-[#eeeeee] bg-[#fafafa]">
          <div className="p-3">
            <p className="text-[10px] font-bold text-[#8b939a]">
              Entry Fee
            </p>

            <p className="mt-1 text-[17px] font-black text-[#111111]">
              ₹{tournament.entryFee || 0}
            </p>
          </div>

          <div className="border-l border-[#e1e1e1] p-3">
            <p className="text-[10px] font-bold text-[#8b939a]">
              Prize Pool
            </p>

            <p className="mt-1 text-[17px] font-black text-[#111111]">
              {tournament.rewardCoins || 0} coin
            </p>
          </div>
        </div>

        {/* PLAYERS */}

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
              style={{
                width: `${percentage}%`,
              }}
            />
          </div>
        </div>

        {/* STATUS */}

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

/* =========================================================
   MAIN PAGE
========================================================= */

export default function MyTournamentsPage() {
  const router = useRouter();

  const [userId, setUserId] =
    useState<string | null>(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [registrations, setRegistrations] =
    useState<Registration[]>([]);

  const [tournaments, setTournaments] =
    useState<Tournament[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState<"upcoming" | "played">(
      "upcoming",
    );

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          if (!user) {
            setUserId(null);

            setAuthLoading(false);

            router.push(
              "/login?redirect=/my-tournaments",
            );

            return;
          }

          setUserId(user.uid);

          setAuthLoading(false);
        },
      );

    return () => unsubscribe();
  }, [router]);

  /* =======================================================
     LOAD USER REGISTRATIONS
  ======================================================= */

  useEffect(() => {
    if (!userId) {
      return;
    }

    setLoading(true);

    const registrationsQuery =
      query(
        collection(
          db,
          "tournamentRegistrations",
        ),
        where(
          "userId",
          "==",
          userId,
        ),
      );

    const unsubscribe =
      onSnapshot(
        registrationsQuery,
        (snapshot) => {
          const list: Registration[] =
            snapshot.docs.map(
              (item) => ({
                id: item.id,

                ...(item.data() as Omit<
                  Registration,
                  "id"
                >),
              }),
            );

          const confirmed =
            list.filter(
              (item) =>
                item.status ===
                "confirmed",
            );

          confirmed.sort(
            (a, b) => {
              const aTime =
                a.createdAt
                  ?.seconds || 0;

              const bTime =
                b.createdAt
                  ?.seconds || 0;

              return (
                bTime - aTime
              );
            },
          );

          setRegistrations(
            confirmed,
          );
        },
        (error) => {
          console.error(
            "Failed to load registrations:",
            error,
          );

          setRegistrations([]);

          setLoading(false);
        },
      );

    return () => unsubscribe();
  }, [userId]);

  /* =======================================================
     LOAD TOURNAMENT DETAILS
  ======================================================= */

  useEffect(() => {
    if (registrations.length === 0) {
      setTournaments([]);

      setLoading(false);

      return;
    }

    let cancelled = false;

    async function loadTournaments() {
      const result: Tournament[] =
        [];

      for (const registration of registrations) {
        try {
          /*
           * Tournament document is normally stored
           * using tournamentId.
           */

          const tournamentRef =
            doc(
              db,
              "tournaments",
              registration.tournamentId,
            );

          let tournamentSnap =
            await getDoc(
              tournamentRef,
            );

          /*
           * Fallback:
           * Some older registrations use
           * tournamentPoints instead.
           */

          if (
            !tournamentSnap.exists() &&
            registration.tournamentPoints
          ) {
            tournamentSnap =
              await getDoc(
                doc(
                  db,
                  "tournaments",
                  String(
                    registration.tournamentPoints,
                  ),
                ),
              );
          }

          if (
            !tournamentSnap.exists()
          ) {
            continue;
          }

          const data =
            tournamentSnap.data();

          const points =
            Number(
              data.points ??
                registration.tournamentPoints ??
                0,
            );

          const category =
            String(
              registration.category ??
                data.category ??
                "sixteenPlayers",
            );

          const maxPlayers =
            Number(
              data.maxPlayers ??
                data.players ??
                (
                  category ===
                  "sixteenPlayers"
                    ? 16
                    : 8
                ),
            );

          const tournament: Tournament =
            {
              id:
                tournamentSnap.id,

              points,

              image:
                data.image ||
                getTournamentImage(
                  points,
                ),

              description:
                data.description ||
                "",

              date:
                registration.date ||
                data.date ||
                "",

              time:
                registration.time ||
                data.time ||
                "",

              category,

              players:
                maxPlayers,

              entryFee:
                Number(
                  registration.entryFee ??
                    data.entryFee ??
                    0,
                ),

              rewardCoins:
                Number(
                  registration.rewardCoins ??
                    data.rewardCoins ??
                    data.coins ??
                    0,
                ),

              status:
                String(
                  data.status ||
                    "upcoming",
                ),

              registeredPlayers:
                Number(
                  data.registeredPlayers ||
                    0,
                ),

              maxPlayers,

              scores:
                data.scores || {},

              matchPlayers:
                data.matchPlayers ||
                {},
            };

          result.push(
            tournament,
          );
        } catch (error) {
          console.error(
            "Failed to load tournament:",
            registration.tournamentId,
            error,
          );
        }
      }

      if (!cancelled) {
        setTournaments(result);

        setLoading(false);
      }
    }

    loadTournaments();

    return () => {
      cancelled = true;
    };
  }, [registrations]);

  /* =======================================================
     UPCOMING / PLAYED
  ======================================================= */

  const upcomingTournaments =
    useMemo(() => {
      if (!userId) {
        return [];
      }

      return tournaments.filter(
        (tournament) =>
          !isTournamentPlayed(
            tournament,
            userId,
          ),
      );
    }, [
      tournaments,
      userId,
    ]);

  const playedTournaments =
    useMemo(() => {
      if (!userId) {
        return [];
      }

      return tournaments.filter(
        (tournament) =>
          isTournamentPlayed(
            tournament,
            userId,
          ),
      );
    }, [
      tournaments,
      userId,
    ]);

  const displayedTournaments =
    activeTab === "upcoming"
      ? upcomingTournaments
      : playedTournaments;

  /* =======================================================
     LOADING
  ======================================================= */

  if (
    authLoading ||
    (loading &&
      tournaments.length === 0)
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

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-[#eeeeee] pb-[82px]">

        {/* ===============================================
            HEADER
        =============================================== */}

        <header className="flex h-[112px] items-center bg-[#FFD600] px-7">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="eFOOTBALL TOURNAMENTS"
              className="h-[48px] w-[185px] object-contain object-left"
            />
          </div>
        </header>

        {/* ===============================================
            TABS
        =============================================== */}

        <div className="border-b border-[#dedede] bg-white">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  "upcoming",
                )
              }
              className={`relative h-[62px] text-[18px] font-black ${
                activeTab === "upcoming"
                  ? "text-[#111111]"
                  : "text-[#a7a7a7]"
              }`}
            >
              Upcoming

              {activeTab ===
                "upcoming" && (
                <span className="absolute bottom-0 left-[36px] right-[36px] h-[4px] rounded-full bg-[#FFD600]" />
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveTab(
                  "played",
                )
              }
              className={`relative h-[62px] text-[18px] font-black ${
                activeTab === "played"
                  ? "text-[#111111]"
                  : "text-[#a7a7a7]"
              }`}
            >
              You Played

              {activeTab ===
                "played" && (
                <span className="absolute bottom-0 left-[36px] right-[36px] h-[4px] rounded-full bg-[#FFD600]" />
              )}
            </button>
          </div>
        </div>

        {/* ===============================================
            CONTENT
        =============================================== */}

        <section className="min-h-[calc(100vh-256px)] bg-[#eeeeee] px-3 pb-8 pt-8">
          {displayedTournaments.length >
          0 ? (
            <div className="flex gap-5 overflow-x-auto pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {displayedTournaments.map(
                (tournament) => (
                  <TournamentCard
                    key={`${tournament.id}_${tournament.date}_${tournament.time}_${tournament.category}`}
                    tournament={
                      tournament
                    }
                    userId={
                      userId || ""
                    }
                    onOpen={() => {
                      const params =
                        new URLSearchParams({
                          category:
                            tournament.category,
                          date:
                            tournament.date,
                          time:
                            tournament.time,
                          tournamentId:
                            tournament.id,
                        });

                      router.push(
                        `/tournament/${tournament.id}?from=my-tournaments`,
                      );
                    }}
                  />
                ),
              )}
            </div>
          ) : (
            <div className="flex min-h-[350px] items-center justify-center px-5">
              <div className="w-full rounded-[22px] border border-[#dedede] bg-white px-6 py-10 text-center shadow-[0_4px_14px_rgba(0,0,0,0.05)]">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD600] text-[30px]">
                  {activeTab ===
                  "upcoming"
                    ? "🎮"
                    : "🏆"}
                </div>

                <p className="mt-5 text-[17px] font-black text-[#111111]">
                  {activeTab ===
                  "upcoming"
                    ? "No upcoming tournaments"
                    : "No tournaments played yet"}
                </p>

                <p className="mx-auto mt-2 max-w-[260px] text-[12px] font-medium leading-5 text-[#8b8b8b]">
                  {activeTab ===
                  "upcoming"
                    ? "Your confirmed tournaments will appear here."
                    : "Tournaments you actually played will appear here."}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ===============================================
            BOTTOM NAV
        =============================================== */}

        <BottomNavigation />
      </div>
    </main>
  );
}