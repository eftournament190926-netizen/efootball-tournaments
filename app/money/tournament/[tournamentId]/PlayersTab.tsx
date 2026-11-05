"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/* =================================================
   TYPES
================================================= */

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
  finalRoomCode?: string;
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
};

/* =================================================
   PLAYERS TAB
================================================= */

export default function PlayersTab({ tournament }: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [roomCode, setRoomCode] = useState(tournament.roomCode || "");
  const [roomCodeA, setRoomCodeA] = useState(tournament.roomCodeA || "");
  const [roomCodeB, setRoomCodeB] = useState(tournament.roomCodeB || "");

  const is4Players = tournament.maxPlayers === 4;
  const is8Players = tournament.maxPlayers === 8;
  const is16Players = tournament.maxPlayers === 16;

  /* =================================================
     REALTIME ROOM CODE LISTENER
  ================================================= */

  useEffect(() => {
    const tournamentRef = doc(
      db,
      "moneyTournaments",
      tournament.id
    );

    const unsubscribe = onSnapshot(
      tournamentRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.data();

        setRoomCode(data.roomCode || "");
        setRoomCodeA(data.roomCodeA || "");
        setRoomCodeB(data.roomCodeB || "");
      },
      (error) => {
        console.error("Failed to listen to room code:", error);
      }
    );

    return () => unsubscribe();
  }, [tournament.id]);

  /* =================================================
     LOAD REGISTERED PLAYERS
  ================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      try {
        setLoading(true);

        const registrationsQuery = query(
          collection(db, "moneyTournamentRegistrations"),
          where("tournamentId", "==", tournament.id)
        );

        const snapshot = await getDocs(registrationsQuery);

        const registrations: Registration[] = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...(document.data() as Omit<Registration, "id">),
          }))
          .filter(
            (registration) =>
              !registration.status ||
              registration.status.toLowerCase() === "confirmed"
          )
          .sort(
            (a, b) =>
              (a.createdAt?.seconds ?? 0) -
              (b.createdAt?.seconds ?? 0)
          );

        const loadedPlayers: Player[] = [];
        const seenUsers = new Set<string>();

        for (const registration of registrations) {
          const uid = registration.userId || registration.uid || "";
          const playerId = uid || registration.id;

          if (seenUsers.has(playerId)) continue;
          seenUsers.add(playerId);

          let username = registration.username || "";
          let profilePhoto = registration.profilePhoto || "";

          if (uid && (!username || !profilePhoto)) {
            try {
              const userDoc = await getDoc(doc(db, "users", uid));

              if (userDoc.exists()) {
                const data = userDoc.data();

                username =
                  username ||
                  data.username ||
                  data.eFootballUsername ||
                  "";

                profilePhoto =
                  profilePhoto ||
                  data.profilePhoto ||
                  "";
              } else {
                const userQuery = query(
                  collection(db, "users"),
                  where("uid", "==", uid)
                );

                const userSnapshot = await getDocs(userQuery);

                if (!userSnapshot.empty) {
                  const data = userSnapshot.docs[0].data();

                  username =
                    username ||
                    data.username ||
                    data.eFootballUsername ||
                    "";

                  profilePhoto =
                    profilePhoto ||
                    data.profilePhoto ||
                    "";
                }
              }
            } catch (error) {
              console.error("Failed to load player profile:", uid, error);
            }
          }

          loadedPlayers.push({
            id: playerId,
            username: username || "Player",
            profilePhoto,
          });
        }

        if (!cancelled) {
          // Show only the tournament's allowed player count.
          setPlayers(loadedPlayers.slice(0, tournament.maxPlayers));
        }
      } catch (error) {
        console.error("Failed to load tournament players:", error);

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
  }, [tournament.id, tournament.maxPlayers]);

  /* =================================================
     PLAYER POOLS
  ================================================= */

  const poolA = useMemo(() => {
    return players.slice(0, is4Players ? 4 : 8);
  }, [players, is4Players]);

  const poolB = useMemo(() => {
    if (!is16Players) return [];
    return players.slice(8, 16);
  }, [players, is16Players]);

  const displayRoomCodeA =
    roomCodeA || roomCode || "Room Code";

  const displayRoomCodeB =
    roomCodeB || roomCode || "Room Code";

  /* =================================================
     LOADING
  ================================================= */

  if (loading) {
    return (
      <div className="bg-white px-4 py-10">
        <div className="flex flex-col items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[4px] border-[#eeeeee] border-t-[#FFD600]" />

          <p className="mt-3 text-[11px] font-black text-[#777777]">
            Loading players...
          </p>
        </div>
      </div>
    );
  }

  /* =================================================
     UI
  ================================================= */

  return (
    <div className="bg-white px-3 pb-6 pt-5">

      {/* 16 PLAYERS */}

      {is16Players ? (
        <div className="grid grid-cols-2 gap-3">
          <PlayerPool
            title="Pool A"
            roomCode={displayRoomCodeA}
            players={poolA}
            startNumber={1}
            slotCount={8}
          />

          <PlayerPool
            title="Pool B"
            roomCode={displayRoomCodeB}
            players={poolB}
            startNumber={9}
            slotCount={8}
          />
        </div>
      ) : (

        /* 4 OR 8 PLAYERS */

        <div className="w-full">
          <PlayerPool
            title="Players"
            roomCode={displayRoomCodeA}
            players={poolA}
            startNumber={1}
            slotCount={is4Players ? 4 : 8}
          />
        </div>
      )}
    </div>
  );
}

/* =================================================
   PLAYER POOL
================================================= */

function PlayerPool({
  title,
  roomCode,
  players,
  startNumber,
  slotCount,
}: {
  title: string;
  roomCode: string;
  players: Player[];
  startNumber: number;
  slotCount: number;
}) {
  const slots = Array.from(
    { length: slotCount },
    (_, index) => players[index] || null
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-[15px] border border-[#e5e5e5] bg-white shadow-[0_3px_12px_rgba(0,0,0,0.05)]">

      {/* HEADER */}

      <div className="relative overflow-hidden bg-[#111111] px-3 py-[12px]">
        <div className="relative z-10 flex items-center justify-center gap-[7px]">
          <span className="text-[15px] leading-none">👥</span>

          <span className="text-[15px] font-black leading-none text-[#FFD600]">
            {title}
          </span>
        </div>

        <div className="absolute -right-[9px] -top-[12px] h-[70px] w-[23px] rotate-[22deg] bg-[#FFD600]" />
      </div>

      {/* ROOM CODE */}

      <div className="px-2.5 pt-3">
        <div className="overflow-hidden rounded-[9px] border border-[#111111] bg-[#FFD600]">
          <div className="bg-[#111111] py-[4px] text-center text-[7px] font-black uppercase tracking-[0.15em] text-[#FFD600]">
            Room Code
          </div>

          <div className="flex h-[32px] items-center justify-center px-2">
            <span className="block max-w-full truncate text-[12px] font-black tracking-[0.04em] text-[#111111]">
              {roomCode || "Room Code"}
            </span>
          </div>
        </div>
      </div>

      {/* PLAYERS */}

      <div className="space-y-[3px] px-2 pb-3 pt-3">
        {slots.map((player, index) => {
          const number = startNumber + index;

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

/* =================================================
   PLAYER ROW
================================================= */

function PlayerRow({
  number,
  player,
}: {
  number: number;
  player: Player | null;
}) {
  if (!player) {
    return (
      <div className="flex min-h-[40px] min-w-0 items-center rounded-[8px] bg-[#f6f6f6] px-[5px]">
        <div className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[#e7e7e7] text-[10px] font-black text-[#888888]">
          {number}
        </div>

        <div className="mx-[6px] flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-full border border-[#dddddd] bg-white">
          <span className="text-[11px] opacity-40">👤</span>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <span className="block truncate text-[10px] font-bold text-[#b0b0b0]">
            Empty Slot
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40px] min-w-0 items-center rounded-[8px] border border-[#f0f0f0] bg-white px-[5px] transition">
      <div className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[#FFD600] text-[10px] font-black text-[#111111]">
        {number}
      </div>

      <div className="mx-[6px] h-[30px] w-[30px] shrink-0 overflow-hidden rounded-full border-2 border-[#FFD600] bg-white">
        {player.profilePhoto ? (
          <img
            src={player.profilePhoto}
            alt={player.username}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#f5f5f5] text-[12px]">
            👤
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate text-[11px] font-black leading-none text-[#111111]">
          {player.username}
        </span>
      </div>
    </div>
  );
}