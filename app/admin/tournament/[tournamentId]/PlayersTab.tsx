"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

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
};

type Registration = {
  id: string;
  userId?: string;
  uid?: string;
  username?: string;
  profilePhoto?: string;
  status?: string;
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  };
};

type Player = {
  id: string;
  username: string;
  profilePhoto: string;
};

type Props = {
  tournament: Tournament;
  onTournamentUpdated?: (data: Partial<Tournament>) => void;
};

export default function PlayersTab({
  tournament,
  onTournamentUpdated,
}: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [roomCodeA, setRoomCodeA] = useState(
    tournament.roomCodeA || tournament.roomCode || "",
  );

  const [roomCodeB, setRoomCodeB] = useState(
    tournament.roomCodeB || tournament.roomCode || "",
  );

  const [savingA, setSavingA] = useState(false);
  const [savingB, setSavingB] = useState(false);

  const is16Players = tournament.maxPlayers === 16;

  useEffect(() => {
    setRoomCodeA(
      tournament.roomCodeA || tournament.roomCode || "",
    );

    setRoomCodeB(
      tournament.roomCodeB || tournament.roomCode || "",
    );
  }, [
    tournament.roomCodeA,
    tournament.roomCodeB,
    tournament.roomCode,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      try {
        setLoading(true);

        const registrationsQuery = query(
          collection(db, "tournamentRegistrations"),
          where("tournamentId", "==", tournament.id),
        );

        const snapshot = await getDocs(
          registrationsQuery,
        );

        const registrations: Registration[] =
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              Registration,
              "id"
            >),
          }));

        registrations.sort((a, b) => {
          const aTime =
            a.createdAt?.seconds ?? 0;

          const bTime =
            b.createdAt?.seconds ?? 0;

          return aTime - bTime;
        });

        const loadedPlayers: Player[] = [];

        for (const registration of registrations) {
          if (
            registration.status &&
            registration.status !== "confirmed"
          ) {
            continue;
          }

          const uid =
            registration.userId ||
            registration.uid;

          if (registration.username) {
            loadedPlayers.push({
              id: uid || registration.id,
              username: registration.username,
              profilePhoto:
                registration.profilePhoto || "",
            });

            continue;
          }

          if (!uid) continue;

          try {
            const userSnapshot = await getDocs(
              query(
                collection(db, "users"),
                where("uid", "==", uid),
              ),
            );

            if (!userSnapshot.empty) {
              const userData =
                userSnapshot.docs[0].data();

              loadedPlayers.push({
                id: uid,
                username:
                  userData.username ||
                  "Player",
                profilePhoto:
                  userData.profilePhoto || "",
              });
            }
          } catch {
            // Ignore failed user lookup.
          }
        }

        if (!cancelled) {
          setPlayers(loadedPlayers);
        }
      } catch (error) {
        console.error(
          "Failed to load tournament players:",
          error,
        );

        if (!cancelled) {
          setPlayers([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [tournament.id]);

  const poolA = useMemo(() => {
    return players.slice(0, 8);
  }, [players]);

  const poolB = useMemo(() => {
    if (!is16Players) {
      return [];
    }

    return players.slice(8, 16);
  }, [players, is16Players]);

  async function saveRoomCodeA() {
    try {
      setSavingA(true);

      const value = roomCodeA.trim();

      await updateDoc(
        doc(db, "tournaments", tournament.id),
        {
          roomCodeA: value,
          updatedAt: serverTimestamp(),
        },
      );

      onTournamentUpdated?.({
        roomCodeA: value,
      });
    } catch (error) {
      console.error(
        "Failed to save Room Code A:",
        error,
      );

      alert("Failed to save Room Code A.");
    } finally {
      setSavingA(false);
    }
  }

  async function saveRoomCodeB() {
    try {
      setSavingB(true);

      const value = roomCodeB.trim();

      await updateDoc(
        doc(db, "tournaments", tournament.id),
        {
          roomCodeB: value,
          updatedAt: serverTimestamp(),
        },
      );

      onTournamentUpdated?.({
        roomCodeB: value,
      });
    } catch (error) {
      console.error(
        "Failed to save Room Code B:",
        error,
      );

      alert("Failed to save Room Code B.");
    } finally {
      setSavingB(false);
    }
  }

  async function saveSingleRoomCode() {
    try {
      setSavingA(true);

      const value = roomCodeA.trim();

      await updateDoc(
        doc(db, "tournaments", tournament.id),
        {
          roomCode: value,
          updatedAt: serverTimestamp(),
        },
      );

      onTournamentUpdated?.({
        roomCode: value,
      });
    } catch (error) {
      console.error(
        "Failed to save Room Code:",
        error,
      );

      alert("Failed to save Room Code.");
    } finally {
      setSavingA(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[16px] bg-white px-3 py-6">
        <div className="flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-[#4bd17b] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[16px] bg-white px-2.5 pb-4 pt-4">
      {is16Players ? (
        <div className="grid grid-cols-2 gap-3">
          <AdminPlayerPool
            title="Pool A"
            roomCode={roomCodeA}
            players={poolA}
            startNumber={1}
            saving={savingA}
            onRoomCodeChange={setRoomCodeA}
            onSave={saveRoomCodeA}
          />

          <AdminPlayerPool
            title="Pool B"
            roomCode={roomCodeB}
            players={poolB}
            startNumber={9}
            saving={savingB}
            onRoomCodeChange={setRoomCodeB}
            onSave={saveRoomCodeB}
          />
        </div>
      ) : (
        <div className="w-full">
          <AdminPlayerPool
            title="Players"
            roomCode={roomCodeA}
            players={poolA}
            startNumber={1}
            saving={savingA}
            onRoomCodeChange={setRoomCodeA}
            onSave={saveSingleRoomCode}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ADMIN PLAYER POOL                                                          */
/* -------------------------------------------------------------------------- */

function AdminPlayerPool({
  title,
  roomCode,
  players,
  startNumber,
  saving,
  onRoomCodeChange,
  onSave,
}: {
  title: string;
  roomCode: string;
  players: Player[];
  startNumber: number;
  saving: boolean;
  onRoomCodeChange: (value: string) => void;
  onSave: () => void;
}) {
  const slots = Array.from(
    { length: 8 },
    (_, index) => players[index] || null,
  );

  return (
    <div className="min-w-0">
      {/* Pool title */}

      <div className="mb-2 text-center text-[16px] font-black leading-none text-[#111111]">
        {title}
      </div>

      {/* Room code editor */}

      <div className="mb-3 rounded-[10px] bg-[#c9c9c9] p-1.5">
        <input
          type="text"
          value={roomCode}
          onChange={(e) =>
            onRoomCodeChange(e.target.value)
          }
          placeholder="Room Code"
          className="h-[25px] w-full min-w-0 rounded-[7px] border-0 bg-white px-2 text-[11px] font-black text-[#111111] outline-none placeholder:text-[#999]"
        />

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="mt-1.5 h-[25px] w-full rounded-[7px] bg-[#18a957] text-[10px] font-black text-white disabled:opacity-60"
        >
          {saving ? "SAVING..." : "SAVE ROOM CODE"}
        </button>
      </div>

      {/* Players */}

      <div className="space-y-[7px]">
        {slots.map((player, index) => {
          const number =
            startNumber + index;

          return (
            <PlayerRow
              key={`${number}-${player?.id || "empty"}`}
              number={number}
              player={player}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PLAYER ROW                                                                 */
/* -------------------------------------------------------------------------- */

function PlayerRow({
  number,
  player,
}: {
  number: number;
  player: Player | null;
}) {
  if (!player) {
    return (
      <div className="flex h-[31px] min-w-0 items-center">
        {/* Number */}

        <div className="w-[17px] shrink-0 text-center text-[12px] font-black text-[#111111]">
          {number}
        </div>

        {/* Empty profile */}

        <div className="mx-[5px] h-[27px] w-[27px] shrink-0 rounded-full border border-[#e5e5e5] bg-[#f3f3f3]" />

        {/* Empty username */}

        <div className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-[11px] font-bold text-[#b0b0b0]">
            Empty Slot
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[31px] min-w-0 items-center">
      {/* Number */}

      <div className="w-[17px] shrink-0 text-center text-[12px] font-black text-[#111111]">
        {number}
      </div>

      {/* Profile */}

      <div className="mx-[5px] h-[27px] w-[27px] shrink-0 overflow-hidden rounded-full border border-[#dddddd] bg-white">
        {player.profilePhoto ? (
          <img
            src={player.profilePhoto}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[12px]">
            👤
          </div>
        )}
      </div>

      {/* Username */}

      <div className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate text-[12px] font-black leading-none text-[#111111]">
          {player.username}
        </span>
      </div>
    </div>
  );
}