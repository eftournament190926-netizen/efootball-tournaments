
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import PlayersTab from "./PlayersTab";
import FixtureTab from "./FixtureTab";
import FixtureTab8Players from "./FixtureTab8Players";
import FixtureTab4Players from "./FixtureTab4Players";

type Tournament = {
  id: string;
  bannerType?: number;
  entryFee: number;
  cashPrize: number;
  firstPrize: number;
  secondPrize: number;
  thirdPrize?: number;
  fourthPrize?: number;
  registeredPlayers: number;
  maxPlayers: number;
  category?: string;
  date: string;
  time: string;
  status: string;
  roomCode?: string;
  roomCodeA?: string;
  roomCodeB?: string;
  semiFinalRoomCode?: string;
  finalRoomCode?: string;
  scores?: Record<string, { p1Score: number; p2Score: number }>;
  matchPlayers?: Record<
    string,
    { player1Id: string; player2Id: string }
  >;
  penaltyWinners?: Record<string, string>;
  winnerId?: string;
  runnerId?: string;
  prizePaid?: boolean;
};

type Tab = "players" | "fixture" | "prizes" | "overview";

function getTournamentDateTime(date: string, time: string) {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);

  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || 0);
  const period = timeMatch[3];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    minute > 59
  ) {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (period === "PM") hour += 12;
  } else if (hour > 23) {
    return null;
  }

  const timestamp =
    Date.UTC(year, month - 1, day, hour, minute) -
    330 * 60 * 1000;

  const result = new Date(timestamp);

  if (
    Number.isNaN(result.getTime()) ||
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    // Validate date separately below because the timestamp
    // represents IST converted into UTC.
    const calendarDate = new Date(
      Date.UTC(year, month - 1, day)
    );

    if (
      calendarDate.getUTCFullYear() !== year ||
      calendarDate.getUTCMonth() !== month - 1 ||
      calendarDate.getUTCDate() !== day
    ) {
      return null;
    }
  }

  return result;
}

function getISTDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getCountdown(tournament: Tournament, now: number) {
  const target = getTournamentDateTime(
    tournament.date,
    tournament.time
  );

  if (!target) return "--:--:--";

  const today = getISTDateString(new Date(now));
  const tournamentDay = tournament.date;

  const todayDate = Date.parse(`${today}T00:00:00Z`);
  const targetDate = Date.parse(`${tournamentDay}T00:00:00Z`);

  const days = Math.round(
    (targetDate - todayDate) / 86400000
  );

  if (target.getTime() <= now) return "Started";

  if (days > 0) {
    return days === 1 ? "1 Day" : `${days} Days`;
  }

  const totalSeconds = Math.floor(
    (target.getTime() - now) / 1000
  );

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function MoneyTournamentManagePage() {
  const params = useParams();
  const router = useRouter();

  const tournamentId =
    typeof params.tournamentId === "string"
      ? params.tournamentId
      : "";

  const [authorized, setAuthorized] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] =
    useState<Tournament | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>("players");
  const [countdown, setCountdown] = useState("--:--:--");
  const [status, setStatus] = useState("upcoming");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCheckingAdmin(true);

      if (!user) {
        router.replace(
          `/login?redirect=/admin/money-tournaments/${tournamentId}`
        );
        return;
      }

      try {
        const adminSnap = await getDoc(
          doc(db, "admins", user.uid)
        );

        if (!adminSnap.exists()) {
          router.replace("/");
          return;
        }

        setAuthorized(true);
      } catch (authError) {
        console.error("Admin check failed:", authError);
        router.replace("/");
      } finally {
        setCheckingAdmin(false);
      }
    });

    return () => unsubscribe();
  }, [router, tournamentId]);

  useEffect(() => {
    if (!authorized || !tournamentId) return;

    setLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, "moneyTournaments", tournamentId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setTournament(null);
          setError("Money Tournament not found.");
        } else {
          const data = snapshot.data();

          const loaded = {
            ...data,
            id: snapshot.id,
            entryFee: Number(data.entryFee || 0),
            cashPrize: Number(data.cashPrize || 0),
            firstPrize: Number(data.firstPrize || 0),
            secondPrize: Number(data.secondPrize || 0),
            thirdPrize: Number(data.thirdPrize || 0),
            fourthPrize: Number(data.fourthPrize || 0),
            registeredPlayers: Number(
              data.registeredPlayers || 0
            ),
            maxPlayers: Number(data.maxPlayers || 16),
            date: data.date || "",
            time: data.time || "",
            status: data.status || "upcoming",
          } as Tournament;

          setTournament(loaded);
          setStatus(loaded.status);
          setError("");
        }

        setLoading(false);
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError("Unable to load Money Tournament.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authorized, tournamentId]);

  useEffect(() => {
    if (!tournament) return;

    const update = () =>
      setCountdown(getCountdown(tournament, Date.now()));

    update();

    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [tournament?.date, tournament?.time]);

  async function saveStatus() {
    if (!tournament || saving) return;

    try {
      setSaving(true);

      await updateDoc(
        doc(db, "moneyTournaments", tournament.id),
        {
          status,
          updatedAt: serverTimestamp(),
        }
      );

      alert("Tournament status updated.");
    } catch (saveError) {
      console.error(saveError);
      alert("Failed to update status.");
    } finally {
      setSaving(false);
    }
  }

  function handleTournamentUpdated(
    changes?: Partial<Tournament>
  ) {
    if (!changes) return;

    setTournament((current) =>
      current ? { ...current, ...changes } : current
    );
  }

  if (checkingAdmin || loading) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#FFD600] border-t-transparent" />
        </div>
      </main>
    );
  }

  if (!authorized) return null;

  if (!tournament) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
        <h1 className="text-xl font-black">
          {error || "Tournament Not Found"}
        </h1>

        <button
          onClick={() =>
            router.push("/admin/money-tournaments")
          }
          className="rounded-xl bg-[#FFD600] px-6 py-3 font-black text-black"
        >
          Back to Money Tournaments
        </button>
      </main>
    );
  }

  const banner = Number(tournament.bannerType || 10);

  const hasFourPrizes =
    [40, 50, 100].includes(banner);

  const prizes = [
    { label: "1st Prize", amount: tournament.firstPrize },
    { label: "2nd Prize", amount: tournament.secondPrize },
    ...(hasFourPrizes
      ? [
          {
            label: "3rd Prize",
            amount: tournament.thirdPrize || 0,
          },
          {
            label: "4th Prize",
            amount: tournament.fourthPrize || 0,
          },
        ]
      : []),
  ];

  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-white pb-10 shadow-[0_0_40px_rgba(0,0,0,0.08)]">
        {/* BANNER */}

{tournament.maxPlayers === 4 ? (

  /* 4 PLAYER CUSTOM BANNER */

  <section className="relative overflow-hidden bg-[#101010] px-5 py-6">

    <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[20px] border-[#FFD600]/10" />

    <div className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full border-[20px] border-[#FFD600]/10" />

    <div className="relative z-10">

      <div className="text-center">

        <div className="inline-flex items-center rounded-full bg-[#FFD600] px-4 py-1 text-[10px] font-black uppercase tracking-[2px] text-black">
          TOURNEX EXCLUSIVE
        </div>

        <h1 className="mt-3 text-[30px] font-black italic leading-none text-white">
          4 PLAYER
        </h1>

        <h2 className="mt-1 text-[25px] font-black italic leading-none text-[#FFD600]">
          SHOWDOWN
        </h2>

        <p className="mt-2 text-[10px] font-bold tracking-[3px] text-[#999999]">
          ONLY FOUR. ONE CHAMPION.
        </p>

      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">

        <div className="rounded-xl border border-[#FFD600] bg-[#FFD600] px-3 py-4 text-center">

          <div className="text-[10px] font-black tracking-[2px] text-black/60">
            🏆 1ST PRIZE
          </div>

          <div className="mt-2 text-[27px] font-black leading-none text-black">
            ₹{tournament.firstPrize ?? 0}
          </div>

        </div>

        <div className="rounded-xl border border-[#555555] bg-[#222222] px-3 py-4 text-center">

          <div className="text-[10px] font-black tracking-[2px] text-[#FFD600]">
            🥈 2ND PRIZE
          </div>

          <div className="mt-2 text-[27px] font-black leading-none text-white">
            ₹{tournament.secondPrize ?? 0}
          </div>

        </div>

      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-[#444444] bg-[#1b1b1b] px-4 py-3">

        <span className="text-[11px] font-black uppercase tracking-[1px] text-[#aaaaaa]">
          Entry Fee
        </span>

        <span className="text-[19px] font-black text-[#FFD600]">
          ₹{tournament.entryFee}
        </span>

      </div>

    </div>

  </section>

) : (

  /* EXISTING 8 & 16 PLAYER IMAGE BANNERS */

  <div className="relative w-full overflow-hidden bg-[#f4f4f4]">

    <img
      src={`/images/money/${banner}.png`}
      alt="Money Tournament Banner"
      className="block h-auto w-full object-cover"
    />

    <button
      type="button"
      onClick={() =>
        router.push("/admin/money-tournaments")
      }
      className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-xl font-black text-black shadow"
      aria-label="Back"
    >
      ‹
    </button>

    <div className="absolute right-3 top-3 rounded-full bg-black/90 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
      Admin
    </div>

  </div>

)}

        {/* MAIN DETAILS */}
        <div className="px-3 pt-3">
          <div className="text-center text-[29px] font-black leading-none text-[#111]">
            {tournament.time}
          </div>

          <div className="mt-4 grid grid-cols-3 items-center">
            <div className="text-center">
              <p className="text-[13px] font-bold text-[#888]">
                Entry Fee
              </p>
              <p className="mt-1 text-[22px] font-black leading-none">
                {tournament.entryFee}
                <span className="ml-1 text-[11px]">
                  PTS
                </span>
              </p>
            </div>

            <div className="text-center">
              <p className="text-[11px] font-bold text-[#999]">
                Starts in
              </p>
              <p className="mt-1 whitespace-nowrap text-[18px] font-black leading-none">
                {countdown}
              </p>
            </div>

            <div className="text-center">
              <p className="text-[13px] font-bold text-[#888]">
                Cash Prize
              </p>
              <p className="mt-1 text-[21px] font-black leading-none">
                ₹{tournament.cashPrize}
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <div className="rounded-full bg-[#f0f0f0] px-4 py-1 text-[12px] font-black text-[#555]">
              {tournament.registeredPlayers} /{" "}
              {tournament.maxPlayers} Players
            </div>
          </div>

          {/* TABS */}
          <div className="mt-5 grid grid-cols-4 border-b border-[#e8e8e8]">
            <TabButton
              label="Players"
              active={activeTab === "players"}
              onClick={() => setActiveTab("players")}
            />
            <TabButton
              label="Fixture"
              active={activeTab === "fixture"}
              onClick={() => setActiveTab("fixture")}
            />
            <TabButton
              label="Prizes"
              active={activeTab === "prizes"}
              onClick={() => setActiveTab("prizes")}
            />
            <TabButton
              label="Settings"
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
            />
          </div>

          {/* TAB CONTENT */}
          <div className="pt-4">
            {activeTab === "players" && (
              <PlayersTab
                tournament={tournament}
                onTournamentUpdated={
                  handleTournamentUpdated
                }
              />
            )}

            {activeTab === "fixture" && (() => {
  switch (tournament.maxPlayers) {
    case 4:
      return (
        <FixtureTab4Players
          tournament={tournament}
          onTournamentUpdated={handleTournamentUpdated}
        />
      );
    case 8:
      return (
        <FixtureTab8Players
          tournament={tournament}
          onTournamentUpdated={handleTournamentUpdated}
        />
      );
    case 16:
      return (
        <FixtureTab
          tournament={tournament}
          onTournamentUpdated={handleTournamentUpdated}
        />
      );
    default:
      return (
        <div className="p-6 text-center text-sm font-bold text-red-500">
          Invalid maxPlayers: {tournament.maxPlayers}
        </div>
      );
  }
})()}

            {activeTab === "prizes" && (
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#f6f6f6] p-4">
                  <h2 className="text-lg font-black">
                    Cash Prize Distribution
                  </h2>

                  <div className="mt-4 space-y-2">
                    {prizes.map((prize) => (
                      <div
                        key={prize.label}
                        className="flex items-center justify-between rounded-xl bg-white p-4"
                      >
                        <span className="text-sm font-bold">
                          {prize.label}
                        </span>
                        <span className="text-xl font-black">
                          ₹{prize.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#f6f6f6] p-4">
                  <h2 className="font-black">
                    Final Match Results
                  </h2>

                  <p className="mt-3 break-all text-xs">
                    Winner UID:{" "}
                    {tournament.winnerId || "Not decided"}
                  </p>

                  <p className="mt-2 break-all text-xs">
                    Runner-up UID:{" "}
                    {tournament.runnerId || "Not decided"}
                  </p>

                  <p className="mt-4 text-xs text-gray-500">
                    Cash prizes are not credited
                    automatically. Admin verification
                    is required.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Entry Fee", `${tournament.entryFee} Points`],
                    ["Cash Prize", `₹${tournament.cashPrize}`],
                    ["Date", tournament.date],
                    ["Time", tournament.time],
                    [
                      "Players",
                      `${tournament.registeredPlayers}/${tournament.maxPlayers}`,
                    ],
                    ["Format", `${tournament.maxPlayers} Players`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl bg-[#f6f6f6] p-4"
                    >
                      <p className="text-[10px] font-bold uppercase text-gray-500">
                        {label}
                      </p>
                      <p className="mt-2 text-sm font-black">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-[#f6f6f6] p-4">
                  <h2 className="mb-3 font-black">
                    Tournament Status
                  </h2>

                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value)
                    }
                    className="w-full rounded-lg border bg-white p-3 font-bold"
                  >
                    <option value="upcoming">
                      Upcoming
                    </option>
                    <option value="ongoing">
                      Ongoing
                    </option>
                    <option value="completed">
                      Completed
                    </option>
                    <option value="cancelled">
                      Cancelled
                    </option>
                  </select>

                  <button
                    type="button"
                    onClick={saveStatus}
                    disabled={
                      saving ||
                      status === tournament.status
                    }
                    className="mt-3 w-full rounded-lg bg-[#111] py-3 font-black text-[#FFD600] disabled:opacity-40"
                  >
                    {saving
                      ? "SAVING..."
                      : "SAVE STATUS"}
                  </button>
                </div>
              </div>
            )}
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
      className={`relative h-[43px] text-[12px] font-black ${
        active
          ? "text-[#111111]"
          : "text-[#aaaaaa]"
      }`}
    >
      {label}

      {active && (
        <span className="absolute bottom-[-1px] left-[18%] right-[18%] h-[3px] rounded-full bg-[#FFD600]" />
      )}
    </button>
  );
}
