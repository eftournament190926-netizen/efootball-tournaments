
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

function isTournamentPlayed(
  tournament: Tournament,
  userId: string
) {
  const { scores, matchPlayers } = tournament;

  for (const matchId of Object.keys(matchPlayers || {})) {
    const match = matchPlayers[matchId];

    const score =
      scores[matchId] ||
      scores[`match${matchId}`];

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

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full max-w-[400px] overflow-hidden rounded-[20px] border border-[#d9d9d9] bg-white text-left shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition active:scale-[0.99]"
    >
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

  const [activeTab, setActiveTab] =
    useState<"upcoming" | "played">("upcoming");

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
        
const registrations: Registration[] = snapshot.docs
  .map((item): Registration => ({
    ...(item.data() as Omit<Registration, "id" | "tournamentType">),
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
        
const registrations: Registration[] = snapshot.docs
  .map((item): Registration => ({
    ...(item.data() as Omit<Registration, "id" | "tournamentType">),
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

  const allRegistrations = useMemo(
    () => [...coinRegistrations, ...moneyRegistrations],
    [coinRegistrations, moneyRegistrations]
  );

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

  const upcomingTournaments = useMemo(() => {
    if (!userId) return [];

    return tournaments.filter(
      (tournament) =>
        !isTournamentPlayed(tournament, userId)
    );
  }, [tournaments, userId]);

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
      : playedTournaments;

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
        <header className="flex h-[112px] items-center bg-[#FFD600] px-7">
          <img
            src="/logo.png"
            alt="eFOOTBALL TOURNAMENTS"
            className="h-[48px] w-[185px] object-contain object-left"
          />
        </header>

        <div className="border-b border-[#dedede] bg-white">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveTab("upcoming")}
              className={`relative h-[62px] text-[18px] font-black ${
                activeTab === "upcoming"
                  ? "text-[#111111]"
                  : "text-[#a7a7a7]"
              }`}
            >
              Upcoming

              {activeTab === "upcoming" && (
                <span className="absolute bottom-0 left-[36px] right-[36px] h-[4px] rounded-full bg-[#FFD600]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("played")}
              className={`relative h-[62px] text-[18px] font-black ${
                activeTab === "played"
                  ? "text-[#111111]"
                  : "text-[#a7a7a7]"
              }`}
            >
              You Played

              {activeTab === "played" && (
                <span className="absolute bottom-0 left-[36px] right-[36px] h-[4px] rounded-full bg-[#FFD600]" />
              )}
            </button>
          </div>
        </div>

        <section className="min-h-[calc(100vh-256px)] bg-[#eeeeee] px-3 pb-8 pt-8">
          {displayedTournaments.length > 0 ? (
            <div className="flex flex-col items-center gap-5 pb-5">
              {displayedTournaments.map((tournament) => (
                <TournamentCard
                  key={`${tournament.tournamentType}_${tournament.id}`}
                  tournament={tournament}
                  userId={userId || ""}
                  

onOpen={() => {
  if (tournament.tournamentType === "money") {
    router.push(`/money/tournament/${tournament.id}`);
  } else {
    router.push(`/tournament/${tournament.id}`);
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
