
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
  phoneNumber?: string;
  phone?: string;
  mobileNumber?: string;
  mobile?: string;
  konamiId?: string;
  status?: string;
  createdAt?: { seconds?: number };
};

type Player = {
  id: string;
  username: string;
  profilePhoto: string;
  phoneNumber: string;
  konamiId: string;
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

  const is4Players = tournament.maxPlayers === 4;
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

  let phoneNumber =
    registration.phoneNumber ||
    registration.phone ||
    registration.mobileNumber ||
    registration.mobile ||
    "";

  let konamiId = registration.konamiId || "";

  if (uid) {
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
          profilePhoto ||
          userData.profilePhoto ||
          "";

        phoneNumber =
          phoneNumber ||
          userData.phoneNumber ||
          userData.phone ||
          userData.mobileNumber ||
          userData.mobile ||
          "";

        konamiId =
          konamiId ||
          userData.konamiId ||
          "";
      }
    } catch (lookupError) {
      console.error("User lookup failed:", lookupError);
    }
  }

  loadedPlayers.push({
    id: uid || registration.id,
    username: username || "Player",
    profilePhoto,
    phoneNumber: String(phoneNumber).trim(),
    konamiId: String(konamiId).trim(),
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

      {is4Players ? (
  <div className="grid grid-cols-1 gap-5">
    <AdminPlayerPool
      title="4 Players"
      players={players.slice(0, 4)}
      roomCode={roomCodeA}
      startNumber={1}
      slotCount={4}
      saving={savingA}
      onRoomCodeChange={setRoomCodeA}
      onSave={() => saveRoomCode("roomCode", roomCodeA)}
    />
  </div>
) : is16Players ? (
  <div className="grid grid-cols-1 gap-5">
    <AdminPlayerPool
      title="Pool A"
      players={poolA}
      roomCode={roomCodeA}
      startNumber={1}
      slotCount={8}
      saving={savingA}
      onRoomCodeChange={setRoomCodeA}
      onSave={() => saveRoomCode("roomCodeA", roomCodeA)}
    />

    <AdminPlayerPool
      title="Pool B"
      players={poolB}
      roomCode={roomCodeB}
      startNumber={9}
      slotCount={8}
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
    slotCount={8}
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
  slotCount,
}: {
  title: string;
  players: Player[];
  roomCode: string;
  startNumber: number;
  saving: boolean;
  onRoomCodeChange: (value: string) => void;
  onSave: () => void;
  slotCount: number;
}) {
  const slots = Array.from(
  { length: slotCount },
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
  const phone = player?.phoneNumber || "";

  const cleanPhone = phone.replace(/\D/g, "");

  const whatsappNumber = cleanPhone.startsWith("91")
    ? cleanPhone
    : cleanPhone.length === 10
    ? `91${cleanPhone}`
    : cleanPhone;

  return (
    <div className="min-w-0 rounded-xl border border-gray-100 bg-[#f7f7f7] p-2">

      <div className="flex min-w-0 items-center gap-2">

        <span className="w-4 shrink-0 text-center text-[11px] font-black">
          {number}
        </span>

        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
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

        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[11px] font-black ${
              player ? "text-black" : "text-gray-300"
            }`}
          >
            {player?.username || "Empty Slot"}
          </p>

          {player?.konamiId && (
            <p className="truncate text-[9px] text-gray-500">
              ID: {player.konamiId}
            </p>
          )}
        </div>
      </div>

      {player && (
        <div className="mt-2 border-t border-gray-200 pt-2">

          <p className="break-all text-[11px] font-bold text-gray-700">
            📞 {phone || "Phone not available"}
          </p>

          {phone && (
            <div className="mt-2 flex gap-1">

              <a
                href={`tel:${phone}`}
                className="flex-1 rounded-md bg-black py-1.5 text-center text-[9px] font-black text-white"
              >
                CALL
              </a>

              {whatsappNumber && (
                <a
                  href={`https://wa.me/${whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-md bg-green-600 py-1.5 text-center text-[9px] font-black text-white"
                >
                  WHATSAPP
                </a>
              )}

              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(phone);
                    alert("Phone number copied.");
                  } catch {
                    alert("Unable to copy phone number.");
                  }
                }}
                className="rounded-md bg-yellow-400 px-2 py-1.5 text-[9px] font-black text-black"
              >
                COPY
              </button>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
