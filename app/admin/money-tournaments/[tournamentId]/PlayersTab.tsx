
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Tournament = {
  id: string;
  maxPlayers: number;
  roomCode?: string;
  roomCodeA?: string;
  roomCodeB?: string;
};

type Registration = {
  id: string;
  userId?: string;
  uid?: string;
  username?: string;
  eFootballUsername?: string;
  profilePhoto?: string;
  status?: string;
  createdAt?: { seconds?: number };
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
  const [error, setError] = useState("");

  const [roomCodeA, setRoomCodeA] = useState(
    tournament.roomCodeA || tournament.roomCode || ""
  );
  const [roomCodeB, setRoomCodeB] = useState(
    tournament.roomCodeB || ""
  );

  const [savingA, setSavingA] = useState(false);
  const [savingB, setSavingB] = useState(false);

  const is16Players = tournament.maxPlayers === 16;

  useEffect(() => {
    setRoomCodeA(
      tournament.roomCodeA || tournament.roomCode || ""
    );
    setRoomCodeB(tournament.roomCodeB || "");
  }, [
    tournament.roomCode,
    tournament.roomCodeA,
    tournament.roomCodeB,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      try {
        setLoading(true);
        setError("");

        const registrationsQuery = query(
          collection(db, "moneyTournamentRegistrations"),
          where("tournamentId", "==", tournament.id)
        );

        const snapshot = await getDocs(registrationsQuery);

        const registrations: Registration[] = snapshot.docs
          .map((item) => ({
            ...(item.data() as Omit<Registration, "id">),
            id: item.id,
          }))
          .filter(
            (item) => !item.status || item.status === "confirmed"
          )
          .sort(
            (a, b) =>
              (a.createdAt?.seconds || 0) -
              (b.createdAt?.seconds || 0)
          );

        const loadedPlayers: Player[] = [];

        for (const registration of registrations) {
          const uid = registration.userId || registration.uid;

          let username =
            registration.username ||
            registration.eFootballUsername ||
            "";

          let profilePhoto = registration.profilePhoto || "";

          if (uid && (!username || !profilePhoto)) {
            try {
              const userSnap = await getDoc(doc(db, "users", uid));

              if (userSnap.exists()) {
                const userData = userSnap.data();

                username =
                  username ||
                  userData.username ||
                  userData.eFootballUsername ||
                  "Player";

                profilePhoto =
                  profilePhoto || userData.profilePhoto || "";
              }
            } catch (lookupError) {
              console.error("User lookup failed:", lookupError);
            }
          }

          loadedPlayers.push({
            id: uid || registration.id,
            username: username || "Player",
            profilePhoto,
          });
        }

        if (!cancelled) {
          setPlayers(loadedPlayers.slice(0, tournament.maxPlayers));
        }
      } catch (loadError) {
        console.error("Failed to load money players:", loadError);

        if (!cancelled) {
          setError("Failed to load registered players.");
          setPlayers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [tournament.id, tournament.maxPlayers]);

  const poolA = useMemo(() => players.slice(0, 8), [players]);

  const poolB = useMemo(
    () => (is16Players ? players.slice(8, 16) : []),
    [players, is16Players]
  );

  async function saveRoomCode(
    field: "roomCode" | "roomCodeA" | "roomCodeB",
    value: string
  ) {
    const setSaving = field === "roomCodeB" ? setSavingB : setSavingA;

    try {
      setSaving(true);

      const cleanedValue = value.trim();

      await updateDoc(
        doc(db, "moneyTournaments", tournament.id),
        {
          [field]: cleanedValue,
          updatedAt: serverTimestamp(),
        }
      );

      onTournamentUpdated?.({
        [field]: cleanedValue,
      });

      alert("Room code saved successfully.");
    } catch (saveError) {
      console.error("Failed to save room code:", saveError);
      alert("Failed to save room code.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center">
        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-[3px] border-yellow-500 border-t-transparent" />
        <p className="mt-3 text-xs font-bold text-gray-500">
          Loading Players...
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white px-3 py-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-black">Registered Players</h2>

        <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-black">
          {players.length}/{tournament.maxPlayers}
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-600">
          {error}
        </p>
      )}

      {is16Players ? (
        <div className="grid grid-cols-2 gap-3">
          <AdminPlayerPool
            title="Pool A"
            players={poolA}
            roomCode={roomCodeA}
            startNumber={1}
            saving={savingA}
            onRoomCodeChange={setRoomCodeA}
            onSave={() => saveRoomCode("roomCodeA", roomCodeA)}
          />

          <AdminPlayerPool
            title="Pool B"
            players={poolB}
            roomCode={roomCodeB}
            startNumber={9}
            saving={savingB}
            onRoomCodeChange={setRoomCodeB}
            onSave={() => saveRoomCode("roomCodeB", roomCodeB)}
          />
        </div>
      ) : (
        <AdminPlayerPool
          title="Players"
          players={poolA}
          roomCode={roomCodeA}
          startNumber={1}
          saving={savingA}
          onRoomCodeChange={setRoomCodeA}
          onSave={() => saveRoomCode("roomCode", roomCodeA)}
        />
      )}
    </div>
  );
}

function AdminPlayerPool({
  title,
  players,
  roomCode,
  startNumber,
  saving,
  onRoomCodeChange,
  onSave,
}: {
  title: string;
  players: Player[];
  roomCode: string;
  startNumber: number;
  saving: boolean;
  onRoomCodeChange: (value: string) => void;
  onSave: () => void;
}) {
  const slots = Array.from(
    { length: 8 },
    (_, index) => players[index] || null
  );

  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-center text-base font-black">
        {title}
      </h3>

      <div className="mb-4 rounded-xl bg-[#ededed] p-2">
        <input
          type="text"
          value={roomCode}
          onChange={(e) => onRoomCodeChange(e.target.value)}
          placeholder="Room Code"
          className="w-full min-w-0 rounded-lg bg-white px-2 py-2 text-xs font-bold text-black outline-none"
        />

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="mt-2 w-full rounded-lg bg-[#111] py-2 text-[10px] font-black text-yellow-400 disabled:opacity-50"
        >
          {saving ? "SAVING..." : "SAVE ROOM CODE"}
        </button>
      </div>

      <div className="space-y-2">
        {slots.map((player, index) => (
          <PlayerRow
            key={`${startNumber + index}-${player?.id || "empty"}`}
            number={startNumber + index}
            player={player}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({
  number,
  player,
}: {
  number: number;
  player: Player | null;
}) {
  return (
    <div className="flex h-9 min-w-0 items-center gap-1.5">
      <span className="w-4 shrink-0 text-center text-[11px] font-black">
        {number}
      </span>

      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
        {player?.profilePhoto ? (
          <img
            src={player.profilePhoto}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs">
            {player ? "👤" : ""}
          </div>
        )}
      </div>

      <span
        className={`min-w-0 flex-1 truncate text-[11px] font-black ${
          player ? "text-black" : "text-gray-300"
        }`}
      >
        {player?.username || "Empty Slot"}
      </span>
    </div>
  );
}
