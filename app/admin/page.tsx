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
  cost: number;
}[] = [
  {
    coins: 550,
    cost: 440,
  },
  {
    coins: 1040,
    cost: 800,
  },
  {
    coins: 3250,
    cost: 2400,
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

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loadingTournaments, setLoadingTournaments] =
    useState(false);

  const [creating, setCreating] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
          router.replace("/");
          return;
        }

        setIsAdmin(true);
        await loadTournaments();
      } catch (err) {
        console.error(err);
        router.replace("/");
      } finally {
        setCheckingAdmin(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadTournaments = async () => {
    try {
      setLoadingTournaments(true);

      const tournamentsRef = collection(db, "tournaments");

      const q = query(
        tournamentsRef,
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);

      const data: Tournament[] = snapshot.docs.map((item) => {
        const tournament = item.data();

        return {
          id: item.id,
          coins: tournament.coins,
          category: tournament.category,
          entryFee: tournament.entryFee,
          date: tournament.date,
          time: tournament.time,
          maxPlayers: tournament.maxPlayers,
          registeredPlayers:
            tournament.registeredPlayers ?? 0,
          status: tournament.status ?? "upcoming",
          roomCode: tournament.roomCode ?? "",
          createdBy: tournament.createdBy ?? "",
        };
      });

      setTournaments(data);
    } catch (err) {
      console.error(err);
      setError("Failed to load tournaments.");
    } finally {
      setLoadingTournaments(false);
    }
  };

  const createTournament = async () => {
    setMessage("");
    setError("");

    if (!date || !time || !entryFee) {
      setError("Please fill all fields.");
      return;
    }

    const fee = Number(entryFee);

    if (fee <= 0) {
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

      await addDoc(collection(db, "tournaments"), {
        type: `${selectedCoins} coins`,
        coins: selectedCoins,
        category: selectedCategory,
        entryFee: fee,
        date,
        time,
        maxPlayers,
        registeredPlayers: 0,
        status: "upcoming",
        roomCode: "",
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setDate("");
      setTime("");
      setEntryFee("");

      setMessage("Tournament created successfully.");

      await loadTournaments();
    } catch (err) {
      console.error(err);
      setError("Failed to create tournament.");
    } finally {
      setCreating(false);
    }
  };

  const deleteTournament = async (id: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this tournament?"
    );

    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "tournaments", id));

      setTournaments((prev) =>
        prev.filter((item) => item.id !== id)
      );

      setMessage("Tournament deleted.");
    } catch (err) {
      console.error(err);
      setError("Failed to delete tournament.");
    }
  };

  if (checkingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f9]">
        <p className="text-[#071426] font-semibold">
          Checking admin access...
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f4f6f9] text-[#071426]">
      <div className="max-w-md mx-auto min-h-screen bg-[#f8f9fb]">
        {/* HEADER */}
        <header className="bg-white border-b border-gray-200 px-5 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-[#0879d1]">
              ADMIN PANEL
            </p>

            <h1 className="text-xl font-black mt-1">
              Tournament Manager
            </h1>
          </div>

          <button
            onClick={() => router.push("/")}
            className="px-3 py-2 rounded-lg bg-[#071426] text-white text-xs font-bold"
          >
            HOME
          </button>
        </header>

        <div className="p-4 space-y-5">
          {/* BOOKINGS BUTTON */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <button
              onClick={() => router.push("/admin/bookings")}
              className="w-full rounded-xl bg-[#0879d1] text-white py-3.5 font-black text-sm"
            >
              TOURNAMENT BOOKINGS
            </button>

            <p className="text-xs text-gray-500 text-center mt-2">
              View bookings, verify payments and manage join codes.
            </p>
          </section>

          {/* CREATE TOURNAMENT */}
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-lg font-black">
              Create Tournament
            </h2>

            <p className="text-xs text-gray-500 mt-1">
              Select tournament reward
            </p>

            {/* COINS */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {coinOptions.map((option) => {
                const selected =
                  selectedCoins === option.coins;

                return (
                  <button
                    key={option.coins}
                    onClick={() =>
                      setSelectedCoins(option.coins)
                    }
                    className={`rounded-xl border p-2 transition ${
                      selected
                        ? "border-[#0879d1] bg-[#eef7ff]"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <img
                      src={getTournamentImage(option.coins)}
                      alt={`${option.coins} coins`}
                      className="w-full h-20 object-contain"
                    />

                    <p className="font-black text-sm mt-1">
                      {option.coins}
                    </p>

                    <p className="text-[11px] text-gray-500">
                      ₹{option.cost}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* CATEGORY */}
            <div className="mt-5">
              <p className="text-xs font-bold text-gray-500 mb-2">
                PLAYER CATEGORY
              </p>

              <div className="grid grid-cols-2 gap-2">
                {[8, 16].map((players) => {
                  const selected =
                    selectedCategory === players;

                  return (
                    <button
                      key={players}
                      onClick={() =>
                        setSelectedCategory(
                          players as PlayerCategory
                        )
                      }
                      className={`py-3 rounded-xl border font-bold ${
                        selected
                          ? "border-[#0879d1] bg-[#eef7ff] text-[#0879d1]"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      {players} Players
                    </button>
                  );
                })}
              </div>
            </div>

            {/* DATE */}
            <div className="mt-5">
              <label className="text-xs font-bold text-gray-500">
                DATE
              </label>

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 px-3 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#0879d1]"
              />
            </div>

            {/* TIME */}
            <div className="mt-4">
              <label className="text-xs font-bold text-gray-500">
                TIME
              </label>

              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full mt-1 px-3 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#0879d1]"
              />
            </div>

            {/* ENTRY FEE */}
            <div className="mt-4">
              <label className="text-xs font-bold text-gray-500">
                ENTRY FEE
              </label>

              <input
                type="number"
                value={entryFee}
                onChange={(e) =>
                  setEntryFee(e.target.value)
                }
                placeholder="₹150"
                className="w-full mt-1 px-3 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#0879d1]"
              />
            </div>

            {/* MAX PLAYERS */}
            <div className="mt-4 rounded-xl bg-[#f4f6f9] p-3">
              <div className="flex justify-between">
                <span className="text-xs text-gray-500">
                  Maximum Players
                </span>

                <span className="font-black">
                  {selectedCategory}
                </span>
              </div>
            </div>

            {/* ROOM CODE INFO */}
            <div className="mt-3 rounded-xl bg-[#fff8e8] border border-[#f0d28a] p-3">
              <p className="text-xs text-[#8a6200]">
                Room code can be added later from the
                tournament management page.
              </p>
            </div>

            {message && (
              <div className="mt-4 rounded-xl bg-[#eaf8f0] text-[#16834a] px-3 py-3 text-sm font-semibold">
                {message}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl bg-[#fff0f0] text-[#d33b3b] px-3 py-3 text-sm font-semibold">
                {error}
              </div>
            )}

            <button
              onClick={createTournament}
              disabled={creating}
              className="w-full mt-5 rounded-xl bg-[#0879d1] text-white py-3.5 font-black text-sm disabled:opacity-50"
            >
              {creating
                ? "CREATING..."
                : "CREATE TOURNAMENT"}
            </button>
          </section>

          {/* TOURNAMENTS */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-black">
                Tournaments
              </h2>

              <button
                onClick={loadTournaments}
                className="text-xs font-bold text-[#0879d1]"
              >
                REFRESH
              </button>
            </div>

            {loadingTournaments ? (
              <div className="bg-white rounded-2xl p-5 text-center text-sm text-gray-500">
                Loading tournaments...
              </div>
            ) : tournaments.length === 0 ? (
              <div className="bg-white rounded-2xl p-5 text-center text-sm text-gray-500 border border-gray-200">
                No tournaments created yet.
              </div>
            ) : (
              <div className="space-y-3">
                {tournaments.map((tournament) => (
                  <div
                    key={tournament.id}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4"
                  >
                    <div className="flex gap-3">
                      <img
                        src={getTournamentImage(
                          tournament.coins
                        )}
                        alt={`${tournament.coins} coins`}
                        className="w-20 h-20 object-contain rounded-xl bg-[#f4f6f9]"
                      />

                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-black">
                              {tournament.coins} Coins
                            </p>

                            <p className="text-xs text-gray-500 mt-1">
                              {tournament.category} Players
                            </p>
                          </div>

                          <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full bg-[#eaf8f0] text-[#16834a]">
                            {tournament.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                      <div className="bg-[#f4f6f9] rounded-lg p-2">
                        <p className="text-gray-500">
                          Date
                        </p>
                        <p className="font-bold mt-1">
                          {tournament.date}
                        </p>
                      </div>

                      <div className="bg-[#f4f6f9] rounded-lg p-2">
                        <p className="text-gray-500">
                          Time
                        </p>
                        <p className="font-bold mt-1">
                          {tournament.time}
                        </p>
                      </div>

                      <div className="bg-[#f4f6f9] rounded-lg p-2">
                        <p className="text-gray-500">
                          Entry
                        </p>
                        <p className="font-bold mt-1">
                          ₹{tournament.entryFee}
                        </p>
                      </div>

                      <div className="bg-[#f4f6f9] rounded-lg p-2">
                        <p className="text-gray-500">
                          Players
                        </p>
                        <p className="font-bold mt-1">
                          {tournament.registeredPlayers}/
                          {tournament.maxPlayers}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="rounded-lg bg-[#f4f6f9] p-2 text-xs">
                        <span className="text-gray-500">
                          Room Code:{" "}
                        </span>

                        <span className="font-bold">
                          {tournament.roomCode
                            ? "Added"
                            : "Not Added"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        onClick={() =>
                          router.push(
                            `/admin/tournament/${tournament.id}`
                          )
                        }
                        className="rounded-xl bg-[#0879d1] text-white py-3 text-xs font-black"
                      >
                        MANAGE
                      </button>

                      <button
                        onClick={() =>
                          deleteTournament(tournament.id)
                        }
                        className="rounded-xl bg-[#fff0f0] text-[#d33b3b] py-3 text-xs font-black"
                      >
                        DELETE
                      </button>
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