"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
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

export default function PlayersTab({ tournament }: Props) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Realtime tournament room-code data
  const [roomCode, setRoomCode] = useState(tournament.roomCode || "");
  const [roomCodeA, setRoomCodeA] = useState(tournament.roomCodeA || "");
  const [roomCodeB, setRoomCodeB] = useState(tournament.roomCodeB || "");

  const is16Players = tournament.maxPlayers === 16;

  /*
   * Listen to tournament document in realtime.
   *
   * Admin changes:
   * roomCode
   * roomCodeA
   * roomCodeB
   *
   * will automatically appear here.
   */
  useEffect(() => {
    const tournamentRef = doc(db, "tournaments", tournament.id);

    const unsubscribe = onSnapshot(
      tournamentRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data();

        setRoomCode(data.roomCode || "");
        setRoomCodeA(data.roomCodeA || "");
        setRoomCodeB(data.roomCodeB || "");
      },
      (error) => {
        console.error("Failed to listen to tournament updates:", error);
      }
    );

    return () => unsubscribe();
  }, [tournament.id]);

  /*
   * Load registered players.
   */
  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      try {
        setLoading(true);

        const registrationsQuery = query(
          collection(db, "tournamentRegistrations"),
          where("tournamentId", "==", tournament.id)
        );

        const snapshot = await getDocs(registrationsQuery);

        const registrations: Registration[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Registration, "id">),
        }));

        /*
         * Keep registration order.
         */
        registrations.sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;

          return aTime - bTime;
        });

        const loadedPlayers: Player[] = [];

        for (const registration of registrations) {
          /*
           * Only confirmed players are shown.
           */
          if (
            registration.status &&
            registration.status !== "confirmed"
          ) {
            continue;
          }

          const uid = registration.userId || registration.uid;

          /*
           * If registration already contains username/photo,
           * use that directly.
           */
          if (registration.username) {
            loadedPlayers.push({
              id: uid || registration.id,
              username: registration.username,
              profilePhoto: registration.profilePhoto || "",
            });

            continue;
          }

          /*
           * Otherwise load user profile.
           */
          if (!uid) {
            continue;
          }

          try {
            const userSnapshot = await getDocs(
              query(
                collection(db, "users"),
                where("uid", "==", uid)
              )
            );

            if (!userSnapshot.empty) {
              const userData = userSnapshot.docs[0].data();

              loadedPlayers.push({
                id: uid,
                username: userData.username || "Player",
                profilePhoto: userData.profilePhoto || "",
              });
            }
          } catch (error) {
            console.error(
              `Failed to load user ${uid}:`,
              error
            );
          }
        }

        if (!cancelled) {
          setPlayers(loadedPlayers);
        }
      } catch (error) {
        console.error(
          "Failed to load tournament players:",
          error
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

  /*
   * Pool A
   */
  const poolA = useMemo(() => {
    return players.slice(0, 8);
  }, [players]);

  /*
   * Pool B
   */
  const poolB = useMemo(() => {
    if (!is16Players) {
      return [];
    }

    return players.slice(8, 16);
  }, [players, is16Players]);

  /*
   * Admin room-code priority:
   *
   * Pool A:
   * roomCodeA → roomCode → placeholder
   *
   * Pool B:
   * roomCodeB → roomCode → placeholder
   *
   * 8 Players:
   * roomCodeA → roomCode → placeholder
   */
  const displayRoomCodeA =
    roomCodeA ||
    roomCode ||
    "Room Code";

  const displayRoomCodeB =
    roomCodeB ||
    roomCode ||
    "Room Code";

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
          <PlayerPool
            title="Pool A"
            roomCode={displayRoomCodeA}
            players={poolA}
            startNumber={1}
          />

          <PlayerPool
            title="Pool B"
            roomCode={displayRoomCodeB}
            players={poolB}
            startNumber={9}
          />
        </div>
      ) : (
        <div className="w-full">
          <PlayerPool
            title="Players"
            roomCode={displayRoomCodeA}
            players={poolA}
            startNumber={1}
          />
        </div>
      )}
    </div>
  );
}

function PlayerPool({
  title,
  roomCode,
  players,
  startNumber,
}: {
  title: string;
  roomCode: string;
  players: Player[];
  startNumber: number;
}) {
  const slots = Array.from({ length: 8 }, (_, index) => {
    return players[index] || null;
  });

  return (
    <div className="min-w-0">
      {/* Pool title */}
      <div className="mb-2 text-center text-[16px] font-black leading-none text-[#111111]">
        {title}
      </div>

      {/* Room code */}
      <div className="mb-3 flex h-[26px] items-center justify-center rounded-[9px] bg-[#c9c9c9] px-1.5">
        <span className="truncate text-[12px] font-black leading-none text-[#111111]">
          {roomCode || "Room Code"}
        </span>
      </div>

      {/* Players */}
      <div className="space-y-[7px]">
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

function PlayerRow({
  number,
  player,
}: {
  number: number;
  player: Player | null;
}) {
  /*
   * Empty slot
   */
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

  /*
   * Player
   */
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