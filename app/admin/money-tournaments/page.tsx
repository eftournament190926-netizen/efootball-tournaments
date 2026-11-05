
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type PlayerCategory = 4 | 8 | 16;
type BannerType = 10 | 20 | 30 | 40 | 50 | 100;

type PrizeAmounts = [number, number, number, number];

type MoneyTournament = {
  id: string;
  bannerType: number;
  entryFee: number;
  cashPrize: number;
  firstPrize: number;
  secondPrize: number;
  thirdPrize: number;
  fourthPrize: number;
  category: PlayerCategory;
  maxPlayers: number;
  registeredPlayers: number;
  date: string;
  time: string;
  status: string;
  roomCode: string;
};

const bannerOptions: BannerType[] = [
  10, 20, 30, 40, 50, 100,
];

const prizePresets: Record<BannerType, PrizeAmounts> = {
  10: [50, 25, 0, 0],
  20: [80, 40, 0, 0],
  30: [100, 50, 0, 0],
  40: [150, 80, 40, 30],
  50: [200, 100, 50, 40],
  100: [500, 250, 150, 100],
};

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 outline-none focus:border-yellow-500";

function getMoneyTournamentImage(bannerType: number) {
  return `/images/money/${bannerType}.png`;
}

function formatTime(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return time;

  const hour = Number(match[1]);
  const minute = match[2];

  if (hour > 23) return time;

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

export default function MoneyTournamentAdminPage() {
  const router = useRouter();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [bannerType, setBannerType] =
    useState<BannerType>(10);

  const [players, setPlayers] =
    useState<PlayerCategory>(16);

  const [entryFee, setEntryFee] = useState("10");

  const [firstPrize, setFirstPrize] = useState("50");
  const [secondPrize, setSecondPrize] = useState("25");
  const [thirdPrize, setThirdPrize] = useState("0");
  const [fourthPrize, setFourthPrize] = useState("0");

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [tournaments, setTournaments] =
    useState<MoneyTournament[]>([]);

  const [loadingList, setLoadingList] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ---------------------------------------
  // PRIZE SETTINGS
  // ---------------------------------------

  function selectBanner(option: BannerType) {
    setBannerType(option);

    const [first, second, third, fourth] =
      prizePresets[option];

    setFirstPrize(String(first));
    setSecondPrize(String(second));
    setThirdPrize(String(third));
    setFourthPrize(String(fourth));

    setError("");
    setSuccess("");
  }

  function selectPlayers(count: PlayerCategory) {
    setPlayers(count);

    if (count === 4) {
      setThirdPrize("0");
      setFourthPrize("0");
    } else {
      const [first, second, third, fourth] =
        prizePresets[bannerType];

      setFirstPrize(String(first));
      setSecondPrize(String(second));
      setThirdPrize(String(third));
      setFourthPrize(String(fourth));
    }

    setError("");
    setSuccess("");
  }

  const hasFourPrizes =
    players !== 4 &&
    [40, 50, 100].includes(bannerType);

  const totalPrize =
    (Number(firstPrize) || 0) +
    (Number(secondPrize) || 0) +
    (hasFourPrizes ? Number(thirdPrize) || 0 : 0) +
    (hasFourPrizes ? Number(fourthPrize) || 0 : 0);

  // ---------------------------------------
  // LOAD TOURNAMENTS
  // ---------------------------------------

  const loadTournaments = useCallback(async () => {
    setLoadingList(true);

    try {
      const snapshot = await getDocs(
        query(
          collection(db, "moneyTournaments"),
          orderBy("createdAt", "desc")
        )
      );

      const data: MoneyTournament[] =
        snapshot.docs.map((item) => {
          const value = item.data();

          const maxPlayers = Number(
            value.maxPlayers ??
            value.category ??
            16
          ) as PlayerCategory;

          return {
            id: item.id,

            bannerType: Number(
              value.bannerType ??
              value.entryFee ??
              10
            ),

            entryFee: Number(value.entryFee ?? 0),
            cashPrize: Number(value.cashPrize ?? 0),

            firstPrize: Number(value.firstPrize ?? 0),
            secondPrize: Number(value.secondPrize ?? 0),
            thirdPrize: Number(value.thirdPrize ?? 0),
            fourthPrize: Number(value.fourthPrize ?? 0),

            category: maxPlayers,
            maxPlayers,

            registeredPlayers: Number(
              value.registeredPlayers ?? 0
            ),

            date: String(value.date ?? ""),
            time: String(value.time ?? ""),
            status: String(value.status ?? "upcoming"),
            roomCode: String(value.roomCode ?? ""),
          };
        });

      setTournaments(data);
    } catch (err) {
      console.error("Load tournaments failed:", err);

      setError(
        "Could not load tournaments. Check Firestore rules."
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  // ---------------------------------------
  // ADMIN AUTHENTICATION
  // ---------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.replace("/login");
          return;
        }

        try {
          const adminSnapshot = await getDoc(
            doc(db, "admins", user.uid)
          );

          if (!adminSnapshot.exists()) {
            setIsAdmin(false);
            router.replace("/");
            return;
          }

          setIsAdmin(true);
          setCheckingAdmin(false);

          await loadTournaments();
        } catch (err) {
          console.error("Admin check failed:", err);
          router.replace("/");
        }
      }
    );

    return () => unsubscribe();
  }, [router, loadTournaments]);

  // ---------------------------------------
  // CREATE TOURNAMENT
  // ---------------------------------------

  async function createTournament() {
    setError("");
    setSuccess("");

    const user = auth.currentUser;

    if (!user) {
      setError("Please log in as admin.");
      return;
    }

    const fee = Number(entryFee);

    if (
      entryFee.trim() === "" ||
      !Number.isInteger(fee) ||
      fee < 10 ||
      fee > 100
    ) {
      setError(
        "Entry Fee must be between 10 and 100 Points."
      );
      return;
    }

    const prizeValues = [
      firstPrize,
      secondPrize,
      ...(hasFourPrizes
        ? [thirdPrize, fourthPrize]
        : []),
    ];

    if (
      prizeValues.some(
        (value) =>
          value.trim() === "" ||
          !Number.isInteger(Number(value)) ||
          Number(value) <= 0
      )
    ) {
      setError(
        "Enter valid positive whole-number prize amounts."
      );
      return;
    }

    if (!date || !time) {
      setError("Please select date and time.");
      return;
    }

    const startsAt = new Date(
      `${date}T${time}:00+05:30`
    );

    if (
      Number.isNaN(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now()
    ) {
      setError(
        "Tournament date and time must be in the future (IST)."
      );
      return;
    }

    try {
      setCreating(true);

      await addDoc(
        collection(db, "moneyTournaments"),
        {
          type:
            players === 4
              ? "4 player money tournament"
              : `${bannerType} money tournament`,

          bannerType,

          entryFee: fee,

          cashPrize: totalPrize,

          firstPrize: Number(firstPrize),
          secondPrize: Number(secondPrize),

          thirdPrize: hasFourPrizes
            ? Number(thirdPrize)
            : 0,

          fourthPrize: hasFourPrizes
            ? Number(fourthPrize)
            : 0,

          coins: 0,

          category: players,
          maxPlayers: players,
          registeredPlayers: 0,

          date,
          time,
          status: "upcoming",

          roomCode: "",
          roomCodeA: "",
          roomCodeB: "",
          finalRoomCode: "",

          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setSuccess(
        "Money Tournament created successfully."
      );

      setDate("");
      setTime("");

      if (players === 4) {
        setFirstPrize("50");
        setSecondPrize("25");
        setThirdPrize("0");
        setFourthPrize("0");
      } else {
        const [first, second, third, fourth] =
          prizePresets[bannerType];

        setFirstPrize(String(first));
        setSecondPrize(String(second));
        setThirdPrize(String(third));
        setFourthPrize(String(fourth));
      }

      await loadTournaments();
    } catch (err) {
      console.error("Create tournament failed:", err);

      setError(
        "Could not create tournament. Check Firestore rules."
      );
    } finally {
      setCreating(false);
    }
  }

  // ---------------------------------------
  // DELETE TOURNAMENT
  // ---------------------------------------

  async function removeTournament(
    tournament: MoneyTournament
  ) {
    setError("");
    setSuccess("");

    if (tournament.registeredPlayers > 0) {
      setError(
        "Cannot delete a tournament with registered players. Resolve registrations and refunds first."
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete ₹${tournament.cashPrize} tournament?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(tournament.id);

      await deleteDoc(
        doc(db, "moneyTournaments", tournament.id)
      );

      setTournaments((previous) =>
        previous.filter(
          (item) => item.id !== tournament.id
        )
      );

      setSuccess("Tournament deleted.");
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Could not delete tournament.");
    } finally {
      setDeletingId(null);
    }
  }

  // ---------------------------------------
  // LOADING
  // ---------------------------------------

  if (checkingAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-sm font-bold">
          Checking admin access...
        </p>
      </main>
    );
  }

  if (!isAdmin) return null;

  // ---------------------------------------
  // UI
  // ---------------------------------------

  return (
    <main className="min-h-screen bg-[#f4f6f9] text-[#101827]">
      <div className="mx-auto min-h-screen max-w-md bg-[#f8f9fb] pb-12">

        {/* HEADER */}

        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white px-4 py-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-600">
              ADMIN PANEL
            </p>

            <h1 className="text-xl font-black">
              Money Tournaments
            </h1>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="rounded-lg border px-3 py-2 text-xs font-bold"
          >
            BACK
          </button>
        </header>

        <div className="space-y-7 px-4 pt-5">

          {/* CREATE SECTION */}

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black">
              Create Tournament
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Select players and configure tournament prizes.
            </p>

            {/* PLAYERS */}

            <label className="mt-5 block text-xs font-black uppercase text-gray-600">
              Tournament Players
            </label>

            <div className="mt-2 grid grid-cols-3 gap-2">
              {([4, 8, 16] as const).map((count) => {
                const active = players === count;

                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => selectPlayers(count)}
                    className={`rounded-xl border py-3 text-sm font-black transition ${
                      active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {count} PLAYERS
                  </button>
                );
              })}
            </div>

            {/* BANNER TYPE - ONLY 8 / 16 */}

            {players !== 4 && (
              <>
                <label className="mt-5 block text-xs font-black uppercase text-gray-600">
                  Tournament Banner
                </label>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  {bannerOptions.map((option) => {
                    const active = bannerType === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => selectBanner(option)}
                        className={`overflow-hidden rounded-xl border text-left transition ${
                          active
                            ? "border-yellow-500 bg-[#FFD600] text-black"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="h-[75px] overflow-hidden bg-black">
                          <img
                            src={getMoneyTournamentImage(option)}
                            alt={`${option} tournament`}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        <div className="py-2 text-center text-xs font-black">
                          {option}.png
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* BANNER PREVIEW */}

                <div className="mt-4 overflow-hidden rounded-xl bg-[#111111]">
                  <img
                    src={getMoneyTournamentImage(bannerType)}
                    alt="Selected tournament banner"
                    className="aspect-[16/9] w-full object-cover"
                  />

                  <p className="py-3 text-center text-xs font-black text-[#FFD600]">
                    SELECTED BANNER: {bannerType}.png
                  </p>
                </div>
              </>
            )}

            {/* FOUR PLAYER BANNER PREVIEW */}

            {players === 4 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-yellow-500 bg-[#111111]">
                <div className="relative flex aspect-[16/9] flex-col items-center justify-center bg-gradient-to-br from-[#262626] via-black to-[#3a3000] px-4 text-center">
                  <p className="text-[10px] font-black tracking-[0.3em] text-[#FFD600]">
                    EXCLUSIVE TOURNAMENT
                  </p>

                  <h3 className="mt-3 text-3xl font-black italic text-white">
                    4 PLAYER
                  </h3>

                  <h3 className="text-3xl font-black italic text-[#FFD600]">
                    SHOWDOWN
                  </h3>

                  <div className="mt-4 flex items-center gap-6">
                    <div>
                      <p className="text-[9px] font-bold text-gray-400">
                        1ST PRIZE
                      </p>
                      <p className="text-xl font-black text-[#FFD600]">
                        ₹{firstPrize || 0}
                      </p>
                    </div>

                    <div className="h-8 w-px bg-gray-600" />

                    <div>
                      <p className="text-[9px] font-bold text-gray-400">
                        2ND PRIZE
                      </p>
                      <p className="text-xl font-black text-white">
                        ₹{secondPrize || 0}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 rounded-full bg-[#FFD600] px-4 py-1 text-[10px] font-black text-black">
                    ENTRY {entryFee || 0} POINTS
                  </p>
                </div>
              </div>
            )}

            {/* ENTRY FEE */}

            <label className="mt-5 block text-xs font-black uppercase text-gray-600">
              Entry Fee (Points)
            </label>

            <input
              type="number"
              min={10}
              max={100}
              step={1}
              value={entryFee}
              onChange={(event) =>
                setEntryFee(event.target.value)
              }
              placeholder="Enter entry fee"
              className={inputClass}
            />

            <p className="mt-2 text-[10px] text-gray-500">
              Entry Fee is independent of Banner Type.
            </p>

            {/* PRIZE DISTRIBUTION */}

            <label className="mt-5 block text-xs font-black uppercase text-gray-600">
              Prize Distribution (₹)
            </label>

            <div className="mt-2 grid grid-cols-2 gap-3">

              {/* FIRST PRIZE */}

              <div>
                <label className="text-xs font-semibold text-gray-500">
                  1st Prize
                </label>

                <input
                  type="number"
                  min={1}
                  value={firstPrize}
                  onChange={(event) =>
                    setFirstPrize(event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              {/* SECOND PRIZE */}

              <div>
                <label className="text-xs font-semibold text-gray-500">
                  2nd Prize
                </label>

                <input
                  type="number"
                  min={1}
                  value={secondPrize}
                  onChange={(event) =>
                    setSecondPrize(event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              {/* THIRD AND FOURTH PRIZE */}

              {hasFourPrizes && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">
                      3rd Prize
                    </label>

                    <input
                      type="number"
                      min={1}
                      value={thirdPrize}
                      onChange={(event) =>
                        setThirdPrize(event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500">
                      4th Prize
                    </label>

                    <input
                      type="number"
                      min={1}
                      value={fourthPrize}
                      onChange={(event) =>
                        setFourthPrize(event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </div>

            {players === 4 && (
              <p className="mt-2 text-[10px] font-semibold text-gray-500">
                4-player tournaments have only 1st and 2nd prizes.
              </p>
            )}

            {/* TOTAL CASH PRIZE */}

            <div className="mt-4 flex items-center justify-between rounded-xl bg-yellow-50 p-4">
              <span className="text-xs font-bold text-gray-600">
                Total Cash Prize
              </span>

              <span className="text-xl font-black text-gray-900">
                ₹{totalPrize}
              </span>
            </div>

            {/* DATE */}

            <label className="mt-5 block text-xs font-black uppercase text-gray-600">
              Date (IST)
            </label>

            <input
              type="date"
              value={date}
              onChange={(event) =>
                setDate(event.target.value)
              }
              className={inputClass}
            />

            {/* TIME */}

            <label className="mt-4 block text-xs font-black uppercase text-gray-600">
              Time (IST)
            </label>

            <input
              type="time"
              value={time}
              onChange={(event) =>
                setTime(event.target.value)
              }
              className={inputClass}
            />

            {/* SUMMARY */}

            <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm font-black">
                Tournament Summary
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-gray-500">
                    Entry
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {entryFee || 0} P
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-500">
                    Prize
                  </p>

                  <p className="mt-1 text-sm font-black">
                    ₹{totalPrize}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-500">
                    Players
                  </p>

                  <p className="mt-1 text-sm font-black">
                    {players}
                  </p>
                </div>
              </div>
            </div>

            {/* ERROR */}

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700"
              >
                {error}
              </p>
            )}

            {/* SUCCESS */}

            {success && (
              <p className="mt-4 rounded-lg bg-green-50 p-3 text-xs font-bold text-green-700">
                {success}
              </p>
            )}

            {/* CREATE BUTTON */}

            <button
              type="button"
              onClick={createTournament}
              disabled={creating}
              className="mt-5 w-full rounded-xl bg-[#111111] py-4 text-sm font-black text-[#FFD600] disabled:opacity-50"
            >
              {creating
                ? "CREATING..."
                : "CREATE MONEY TOURNAMENT"}
            </button>
          </section>

          {/* CREATED TOURNAMENTS */}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black">
                Created Tournaments
              </h2>

              <button
                type="button"
                onClick={loadTournaments}
                className="rounded-lg border bg-white px-3 py-2 text-xs font-bold"
              >
                REFRESH
              </button>
            </div>

            {loadingList ? (
              <p className="text-sm text-gray-500">
                Loading tournaments...
              </p>
            ) : tournaments.length === 0 ? (
              <p className="rounded-xl border bg-white p-5 text-center text-sm text-gray-500">
                No money tournaments yet.
              </p>
            ) : (
              <div className="space-y-3">
                {tournaments.map((tournament) => (
                  <article
                    key={tournament.id}
                    className="overflow-hidden rounded-2xl border bg-white shadow-sm"
                  >
                    {/* BANNER */}

                    <div className="relative bg-[#111111]">
                      {tournament.maxPlayers === 4 ? (
                        <div className="flex aspect-[16/9] flex-col items-center justify-center bg-gradient-to-br from-[#262626] via-black to-[#3a3000] text-center">
                          <p className="text-[10px] font-black tracking-[0.3em] text-[#FFD600]">
                            EXCLUSIVE TOURNAMENT
                          </p>

                          <h3 className="mt-2 text-3xl font-black italic text-white">
                            4 PLAYER
                          </h3>

                          <h3 className="text-3xl font-black italic text-[#FFD600]">
                            SHOWDOWN
                          </h3>

                          <div className="mt-3 flex items-center gap-6">
                            <div>
                              <p className="text-[9px] font-bold text-gray-400">
                                1ST PRIZE
                              </p>
                              <p className="text-lg font-black text-[#FFD600]">
                                ₹{tournament.firstPrize}
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] font-bold text-gray-400">
                                2ND PRIZE
                              </p>
                              <p className="text-lg font-black text-white">
                                ₹{tournament.secondPrize}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={getMoneyTournamentImage(
                            tournament.bannerType
                          )}
                          alt="Money tournament banner"
                          className="aspect-[16/9] w-full object-cover"
                        />
                      )}

                      <div className="absolute left-3 top-3 rounded-full bg-[#FFD600] px-3 py-1.5 text-[10px] font-black text-black">
                        {tournament.entryFee} P ENTRY
                      </div>

                      <div className="absolute right-3 top-3 rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-black">
                        {tournament.maxPlayers} PLAYERS
                      </div>
                    </div>

                    {/* CONTENT */}

                    <div className="space-y-3 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black">
                          ₹{tournament.cashPrize} Cash Prize
                        </h3>

                        <span className="text-[10px] font-bold uppercase text-gray-500">
                          {tournament.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-gray-100 p-3">
                          <p className="text-[9px] text-gray-500">
                            ENTRY FEE
                          </p>

                          <p className="mt-1 text-sm font-black">
                            {tournament.entryFee} P
                          </p>
                        </div>

                        <div className="rounded-lg bg-gray-100 p-3">
                          <p className="text-[9px] text-gray-500">
                            PLAYERS
                          </p>

                          <p className="mt-1 text-sm font-black">
                            {tournament.registeredPlayers}/
                            {tournament.maxPlayers}
                          </p>
                        </div>
                      </div>

                      {/* PRIZE DETAILS */}

                      <div className="rounded-xl border border-gray-200 p-3">
                        <p className="text-[10px] font-black uppercase text-gray-500">
                          Prize Distribution
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
                          <p>
                            1st: ₹{tournament.firstPrize}
                          </p>

                          <p>
                            2nd: ₹{tournament.secondPrize}
                          </p>

                          {tournament.thirdPrize > 0 && (
                            <p>
                              3rd: ₹{tournament.thirdPrize}
                            </p>
                          )}

                          {tournament.fourthPrize > 0 && (
                            <p>
                              4th: ₹{tournament.fourthPrize}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* DATE AND TIME */}

                      <p className="text-xs font-semibold text-gray-500">
                        {tournament.date} •{" "}
                        {formatTime(tournament.time)} IST
                      </p>

                      {/* ROOM CODE */}

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-[9px] text-gray-500">
                            ROOM CODE
                          </p>

                          <p className="mt-1 text-xs font-black">
                            {tournament.roomCode
                              ? "ADDED"
                              : "NOT ADDED"}
                          </p>
                        </div>

                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            tournament.roomCode
                              ? "bg-green-500"
                              : "bg-amber-500"
                          }`}
                        />
                      </div>

                      {/* ACTION BUTTONS */}

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/admin/money-tournaments/${tournament.id}`
                            )
                          }
                          className="flex-1 rounded-lg bg-[#111111] py-3 text-xs font-black text-[#FFD600]"
                        >
                          MANAGE
                        </button>

                        <button
                          type="button"
                          disabled={
                            deletingId === tournament.id ||
                            tournament.registeredPlayers > 0
                          }
                          onClick={() =>
                            removeTournament(tournament)
                          }
                          className="rounded-lg border border-red-200 px-4 py-3 text-xs font-black text-red-600 disabled:opacity-40"
                        >
                          {deletingId === tournament.id
                            ? "DELETING..."
                            : "DELETE"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
