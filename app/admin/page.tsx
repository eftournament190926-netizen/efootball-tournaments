"use client";

import { useEffect, useState } from "react";
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

type CoinType = 550 | 1040 | 3250;
type PlayerCategory = 8 | 16;

type Tournament = {
  id: string;
  coins: CoinType;
  category: PlayerCategory;
  entryFee: number;
  date: string;
  time: string;
  maxPlayers: number;
  registeredPlayers: number;
  status: string;
  roomCode: string;
  createdBy: string;
};

const coinOptions: {
  coins: CoinType;
  cost: string;
}[] = [
  {
    coins: 550,
    cost: "₹440",
  },
  {
    coins: 1040,
    cost: "₹800",
  },
  {
    coins: 3250,
    cost: "₹2,400",
  },
];

function getTournamentImage(coins: CoinType) {
  return `/images/${coins}.png`;
}

export default function AdminPage() {
  const router = useRouter();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedCoins, setSelectedCoins] =
    useState<CoinType>(550);

  const [selectedCategory, setSelectedCategory] =
    useState<PlayerCategory>(16);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [entryFee, setEntryFee] = useState("");

  const [tournaments, setTournaments] = useState<Tournament[]>(
    []
  );

  const [loadingTournaments, setLoadingTournaments] =
    useState(false);

  const [creating, setCreating] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /* -------------------------------------------------
     ADMIN CHECK
  ------------------------------------------------- */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.replace("/login");
          return;
        }

        try {
          const adminRef = doc(db, "admins", user.uid);
          const adminSnap = await getDoc(adminRef);

          if (!adminSnap.exists()) {
            setIsAdmin(false);
            router.replace("/");
            return;
          }

          setIsAdmin(true);
          setCheckingAdmin(false);

          await loadTournaments();
        } catch (err) {
          console.error("Admin check failed:", err);

          setIsAdmin(false);
          router.replace("/");
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  /* -------------------------------------------------
     LOAD TOURNAMENTS
  ------------------------------------------------- */

  async function loadTournaments() {
    setLoadingTournaments(true);
    setError("");

    try {
      const tournamentsQuery = query(
        collection(db, "tournaments"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(tournamentsQuery);

      const data: Tournament[] = snapshot.docs.map(
        (item) => {
          const value = item.data();

          return {
            id: item.id,
            coins: value.coins,
            category: value.category,
            entryFee: value.entryFee,
            date: value.date,
            time: value.time,
            maxPlayers: value.maxPlayers,
            registeredPlayers:
              value.registeredPlayers ?? 0,
            status: value.status ?? "upcoming",
            roomCode: value.roomCode ?? "",
            createdBy: value.createdBy ?? "",
          };
        }
      );

      setTournaments(data);
    } catch (err) {
      console.error("Failed to load tournaments:", err);
      setError("Failed to load tournaments.");
    } finally {
      setLoadingTournaments(false);
    }
  }

  /* -------------------------------------------------
     CREATE TOURNAMENT
  ------------------------------------------------- */

  async function createTournament() {
    setMessage("");
    setError("");

    if (!date) {
      setError("Please select a date.");
      return;
    }

    if (!time) {
      setError("Please select a time.");
      return;
    }

    if (!entryFee || Number(entryFee) <= 0) {
      setError("Please enter a valid entry fee.");
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      setError("You are not logged in.");
      return;
    }

    try {
      setCreating(true);

      const maxPlayers = selectedCategory;

      const tournamentData = {
        type: `${selectedCoins} coins`,
        coins: selectedCoins,
        category: selectedCategory,
        entryFee: Number(entryFee),
        date,
        time,
        maxPlayers,
        registeredPlayers: 0,
        status: "upcoming",

        // Room code will be added later
        // from the tournament detail page.
        roomCode: "",

        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(
        collection(db, "tournaments"),
        tournamentData
      );

      setMessage("Tournament created successfully.");

      setDate("");
      setTime("");
      setEntryFee("");

      await loadTournaments();
    } catch (err) {
      console.error(
        "Failed to create tournament:",
        err
      );

      setError("Failed to create tournament.");
    } finally {
      setCreating(false);
    }
  }

  /* -------------------------------------------------
     DELETE TOURNAMENT
  ------------------------------------------------- */

  async function deleteTournament(id: string) {
    const confirmed = window.confirm(
      "Delete this tournament?"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "tournaments", id));

      setTournaments((current) =>
        current.filter((item) => item.id !== id)
      );

      setMessage("Tournament deleted.");
    } catch (err) {
      console.error(
        "Failed to delete tournament:",
        err
      );

      setError("Failed to delete tournament.");
    }
  }

  /* -------------------------------------------------
     LOADING
  ------------------------------------------------- */

  if (checkingAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f9]">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-[#dce2e9] border-t-[#0879d1]" />

          <p className="mt-3 text-sm font-bold text-[#647084]">
            Checking admin access...
          </p>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return null;
  }

  /* -------------------------------------------------
     UI
  ------------------------------------------------- */

  return (
    <main className="min-h-screen bg-[#f4f6f9]">
      <div className="mx-auto min-h-screen max-w-md bg-[#f8f9fb]">
        {/* HEADER */}
        <header className="sticky top-0 z-50 border-b border-[#e5e8ed] bg-white">
          <div className="flex h-[64px] items-center justify-between px-4">
            <div>
              <p className="text-[8px] font-black tracking-[0.25em] text-[#0879d1]">
                ADMIN PANEL
              </p>

              <h1 className="mt-1 text-[19px] font-black tracking-[-0.04em] text-[#071426]">
                Tournament Manager
              </h1>
            </div>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-[10px] border border-[#e0e5eb] bg-white px-3 py-2 text-[9px] font-extrabold text-[#566173]"
            >
              HOME
            </button>
          </div>
        </header>

        <div className="px-4 pb-10">
          {/* CREATE TOURNAMENT */}
          <section className="pt-5">
            <div className="mb-3">
              <h2 className="text-[17px] font-black text-[#071426]">
                Create Tournament
              </h2>

              <p className="mt-1 text-[10px] font-medium text-[#8a94a4]">
                Schedule a new eFootball tournament.
              </p>
            </div>

            <div className="rounded-[18px] border border-[#e3e7ed] bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
              {/* COINS */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wide text-[#657084]">
                  Tournament Type
                </label>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  {coinOptions.map((item) => {
                    const active =
                      selectedCoins === item.coins;

                    return (
                      <button
                        key={item.coins}
                        type="button"
                        onClick={() =>
                          setSelectedCoins(item.coins)
                        }
                        className={`overflow-hidden rounded-[12px] border text-left transition ${
                          active
                            ? "border-[#0879d1] bg-[#0879d1] text-white shadow-[0_4px_12px_rgba(8,121,209,0.2)]"
                            : "border-[#e1e6ec] bg-white text-[#071426]"
                        }`}
                      >
                        <div className="h-[70px] w-full overflow-hidden">
                          <img
                            src={getTournamentImage(
                              item.coins
                            )}
                            alt={`${item.coins} coins`}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        <div className="px-2 pb-2 pt-2">
                          <div className="text-[15px] font-black">
                            {item.coins}
                          </div>

                          <div
                            className={`text-[7px] font-extrabold ${
                              active
                                ? "text-white/75"
                                : "text-[#9aa3b1]"
                            }`}
                          >
                            COINS
                          </div>

                          <div
                            className={`mt-1.5 text-[7px] font-bold ${
                              active
                                ? "text-white/80"
                                : "text-[#778294]"
                            }`}
                          >
                            Cost {item.cost}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CATEGORY */}
              <div className="mt-5">
                <label className="text-[10px] font-black uppercase tracking-wide text-[#657084]">
                  Players
                </label>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[8, 16].map((players) => {
                    const active =
                      selectedCategory === players;

                    return (
                      <button
                        key={players}
                        type="button"
                        onClick={() =>
                          setSelectedCategory(
                            players as PlayerCategory
                          )
                        }
                        className={`rounded-[12px] border py-3 text-center transition ${
                          active
                            ? "border-[#071426] bg-[#071426] text-white"
                            : "border-[#e1e6ec] bg-white text-[#566173]"
                        }`}
                      >
                        <div className="text-[15px] font-black">
                          {players}
                        </div>

                        <div
                          className={`text-[8px] font-extrabold ${
                            active
                              ? "text-white/60"
                              : "text-[#9aa3b1]"
                          }`}
                        >
                          PLAYERS
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DATE */}
              <div className="mt-5">
                <label
                  htmlFor="tournament-date"
                  className="text-[10px] font-black uppercase tracking-wide text-[#657084]"
                >
                  Date
                </label>

                <input
                  id="tournament-date"
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(event.target.value)
                  }
                  className="mt-2 h-[44px] w-full rounded-[11px] border border-[#dfe4ea] bg-white px-3 text-[12px] font-semibold text-[#071426] outline-none transition focus:border-[#0879d1]"
                />
              </div>

              {/* TIME */}
              <div className="mt-4">
                <label
                  htmlFor="tournament-time"
                  className="text-[10px] font-black uppercase tracking-wide text-[#657084]"
                >
                  Time
                </label>

                <input
                  id="tournament-time"
                  type="time"
                  value={time}
                  onChange={(event) =>
                    setTime(event.target.value)
                  }
                  className="mt-2 h-[44px] w-full rounded-[11px] border border-[#dfe4ea] bg-white px-3 text-[12px] font-semibold text-[#071426] outline-none transition focus:border-[#0879d1]"
                />
              </div>

              {/* ENTRY FEE */}
              <div className="mt-4">
                <label
                  htmlFor="entry-fee"
                  className="text-[10px] font-black uppercase tracking-wide text-[#657084]"
                >
                  Entry Fee
                </label>

                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-black text-[#7b8595]">
                    ₹
                  </span>

                  <input
                    id="entry-fee"
                    type="number"
                    min="1"
                    value={entryFee}
                    onChange={(event) =>
                      setEntryFee(event.target.value)
                    }
                    placeholder="Enter entry fee"
                    className="h-[44px] w-full rounded-[11px] border border-[#dfe4ea] bg-white pl-8 pr-3 text-[12px] font-semibold text-[#071426] outline-none transition placeholder:text-[#b0b7c1] focus:border-[#0879d1]"
                  />
                </div>
              </div>

              {/* MAX PLAYERS */}
              <div className="mt-4">
                <label className="text-[10px] font-black uppercase tracking-wide text-[#657084]">
                  Maximum Players
                </label>

                <div className="mt-2 flex h-[44px] items-center justify-between rounded-[11px] bg-[#f1f4f7] px-3">
                  <span className="text-[11px] font-semibold text-[#7b8595]">
                    Based on category
                  </span>

                  <span className="text-[13px] font-black text-[#071426]">
                    {selectedCategory} Players
                  </span>
                </div>
              </div>

              {/* INFO */}
              <div className="mt-4 rounded-[11px] bg-[#f1f7fc] p-3">
                <p className="text-[9px] leading-4 text-[#607085]">
                  Room code will be added later from the
                  tournament detail page. The same tournament
                  document will be updated.
                </p>
              </div>

              {/* MESSAGE */}
              {message && (
                <div className="mt-4 rounded-[11px] bg-[#edf9f2] px-3 py-2.5">
                  <p className="text-[10px] font-bold text-[#16834a]">
                    {message}
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-[11px] bg-[#fff1f1] px-3 py-2.5">
                  <p className="text-[10px] font-bold text-[#d33b3b]">
                    {error}
                  </p>
                </div>
              )}

              {/* CREATE */}
              <button
                type="button"
                onClick={createTournament}
                disabled={creating}
                className="mt-5 flex h-[46px] w-full items-center justify-center rounded-[12px] bg-[#071426] text-[10px] font-black tracking-[0.08em] text-white shadow-[0_5px_14px_rgba(7,20,38,0.16)] transition hover:bg-[#0c2947] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating
                  ? "CREATING..."
                  : "CREATE TOURNAMENT"}
              </button>
            </div>
          </section>

          {/* TOURNAMENT LIST */}
          <section className="mt-8">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-[17px] font-black text-[#071426]">
                  Tournaments
                </h2>

                <p className="mt-1 text-[10px] font-medium text-[#8a94a4]">
                  Manage created tournaments.
                </p>
              </div>

              <button
                type="button"
                onClick={loadTournaments}
                className="rounded-[9px] border border-[#e1e6ec] bg-white px-3 py-2 text-[9px] font-extrabold text-[#566173]"
              >
                REFRESH
              </button>
            </div>

            {loadingTournaments ? (
              <div className="rounded-[16px] border border-[#e3e7ed] bg-white p-6 text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-[2px] border-[#dce2e9] border-t-[#0879d1]" />

                <p className="mt-3 text-[10px] font-bold text-[#8a94a4]">
                  Loading tournaments...
                </p>
              </div>
            ) : tournaments.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[#d8dee6] bg-white p-7 text-center">
                <div className="text-2xl">🏆</div>

                <p className="mt-2 text-[12px] font-black text-[#071426]">
                  No tournaments yet
                </p>

                <p className="mt-1 text-[9px] font-medium text-[#8a94a4]">
                  Create your first tournament above.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {tournaments.map((tournament) => (
                  <div
                    key={tournament.id}
                    className="overflow-hidden rounded-[18px] border border-[#e3e7ed] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]"
                  >
                    {/* ---------------------------------
                        TOURNAMENT IMAGE PREVIEW
                    --------------------------------- */}
                    <div className="relative h-[170px] w-full overflow-hidden bg-[#071426]">
                      <img
                        src={getTournamentImage(
                          tournament.coins
                        )}
                        alt={`${tournament.coins} Coins Tournament`}
                        className="h-full w-full object-cover"
                      />

                      {/* dark overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                      {/* player badge */}
                      <div className="absolute left-3 top-3 rounded-full bg-white px-3 py-1.5 text-[8px] font-black text-[#071426] shadow-sm">
                        {tournament.category} PLAYERS
                      </div>

                      {/* status */}
                      <div className="absolute right-3 top-3 rounded-full bg-[#edf9f2] px-3 py-1.5 text-[8px] font-black uppercase text-[#16834a] shadow-sm">
                        {tournament.status}
                      </div>

                      {/* image title */}
                      <div className="absolute bottom-3 left-3">
                        <div className="flex items-end gap-1.5">
                          <span className="text-[27px] font-black italic leading-none text-white">
                            {tournament.coins}
                          </span>

                          <span className="mb-0.5 text-[8px] font-black tracking-[0.15em] text-white/75">
                            COINS
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CARD CONTENT */}
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-2">
                        {/* DATE */}
                        <div className="rounded-[11px] bg-[#f6f8fa] p-3">
                          <p className="text-[8px] font-bold text-[#9aa3b1]">
                            DATE
                          </p>

                          <p className="mt-1 text-[11px] font-black text-[#071426]">
                            {tournament.date}
                          </p>
                        </div>

                        {/* TIME */}
                        <div className="rounded-[11px] bg-[#f6f8fa] p-3">
                          <p className="text-[8px] font-bold text-[#9aa3b1]">
                            TIME
                          </p>

                          <p className="mt-1 text-[11px] font-black text-[#071426]">
                            {tournament.time}
                          </p>
                        </div>

                        {/* ENTRY */}
                        <div className="rounded-[11px] bg-[#f6f8fa] p-3">
                          <p className="text-[8px] font-bold text-[#9aa3b1]">
                            ENTRY
                          </p>

                          <p className="mt-1 text-[11px] font-black text-[#071426]">
                            ₹{tournament.entryFee}
                          </p>
                        </div>

                        {/* PLAYERS */}
                        <div className="rounded-[11px] bg-[#f6f8fa] p-3">
                          <p className="text-[8px] font-bold text-[#9aa3b1]">
                            PLAYERS
                          </p>

                          <p className="mt-1 text-[11px] font-black text-[#071426]">
                            {tournament.registeredPlayers}/
                            {tournament.maxPlayers}
                          </p>
                        </div>
                      </div>

                      {/* ROOM STATUS */}
                      <div className="mt-3 flex items-center justify-between rounded-[11px] border border-[#e7ebef] bg-white px-3 py-2.5">
                        <div>
                          <p className="text-[8px] font-bold text-[#9aa3b1]">
                            ROOM CODE
                          </p>

                          <p className="mt-1 text-[10px] font-black text-[#071426]">
                            {tournament.roomCode
                              ? "ADDED"
                              : "NOT ADDED"}
                          </p>
                        </div>

                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            tournament.roomCode
                              ? "bg-[#20a45a]"
                              : "bg-[#f0a52b]"
                          }`}
                        />
                      </div>

                      {/* BUTTONS */}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/admin/tournament/${tournament.id}`
                            )
                          }
                          className="flex-1 rounded-[11px] bg-[#071426] py-3 text-[9px] font-black tracking-[0.08em] text-white transition hover:bg-[#0c2947]"
                        >
                          MANAGE TOURNAMENT
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            deleteTournament(
                              tournament.id
                            )
                          }
                          className="rounded-[11px] border border-[#f0d5d5] bg-[#fff7f7] px-4 py-3 text-[9px] font-black text-[#d33b3b]"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}