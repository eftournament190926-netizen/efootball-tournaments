"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Booking = {
  id: string;
  tournamentId: string;
  username: string;
  konamiId: string;
  profilePhoto?: string;
  entryFee: number;
  status: string;
  paymentStatus: string;
  joinCode: string;
};

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
};

export default function BookingsTab({
  tournamentId,
  tournament,
}: {
  tournamentId: string;
  tournament: Tournament;
}) {
  const [bookings, setBookings] = useState<Booking[]>(
    []
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tournamentId) {
      setError("Tournament ID is missing.");
      setLoading(false);
      return;
    }

    async function loadBookings() {
      try {
        setLoading(true);
        setError("");

        console.log(
          "BOOKINGS PAGE TOURNAMENT ID:",
          tournamentId
        );

        const registrationsRef = collection(
          db,
          "tournamentRegistrations"
        );

        const bookingsQuery = query(
          registrationsRef,
          where(
            "tournamentId",
            "==",
            tournamentId
          )
        );

        const snapshot = await getDocs(
          bookingsQuery
        );

        console.log(
          "BOOKINGS FOUND:",
          snapshot.size
        );

        const data: Booking[] =
          snapshot.docs.map((item) => {
            const booking = item.data();

            console.log(
              "BOOKING:",
              item.id,
              booking.tournamentId
            );

            return {
              id: item.id,

              tournamentId:
                booking.tournamentId || "",

              username:
                booking.username || "",

              konamiId:
                booking.konamiId || "",

              profilePhoto:
                booking.profilePhoto || "",

              entryFee:
                Number(
                  booking.entryFee || 0
                ),

              status:
                booking.status || "pending",

              paymentStatus:
                booking.paymentStatus ||
                "pending",

              joinCode:
                booking.joinCode || "",
            };
          });

        setBookings(data);
      } catch (err) {
        console.error(
          "Failed to load tournament bookings:",
          err
        );

        setError(
          "Failed to load bookings."
        );
      } finally {
        setLoading(false);
      }
    }

    loadBookings();
  }, [tournamentId]);

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-[14px] font-bold text-[#888888]">
          Loading bookings...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* TOURNAMENT ID DEBUG / INFO */}
      <div className="rounded-[12px] bg-[#f5f5f5] p-3">
        <p className="text-[10px] font-bold uppercase text-[#999999]">
          Tournament ID
        </p>

        <p className="mt-1 break-all text-[12px] font-black text-[#111111]">
          {tournamentId}
        </p>
      </div>

      {/* ERROR */}
      {error && (
        <div className="rounded-[12px] bg-[#fff0f0] p-3">
          <p className="text-[13px] font-bold text-[#d33b3b]">
            {error}
          </p>
        </div>
      )}

      {/* COUNT */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-black text-[#111111]">
            Bookings
          </h2>

          <p className="mt-1 text-[12px] text-[#888888]">
            {bookings.length} /{" "}
            {tournament.maxPlayers} players
          </p>
        </div>

        <div className="rounded-full bg-[#f0f0f0] px-3 py-1 text-[11px] font-black text-[#555555]">
          {bookings.length} Booked
        </div>
      </div>

      {/* NO BOOKINGS */}
      {bookings.length === 0 && !error && (
        <div className="rounded-[16px] bg-[#f5f5f5] p-6 text-center">
          <p className="text-[16px] font-black text-[#111111]">
            No Bookings
          </p>

          <p className="mt-1 text-[12px] text-[#888888]">
            No player has joined this tournament.
          </p>
        </div>
      )}

      {/* BOOKINGS */}
      {bookings.map(
        (booking, index) => (
          <div
            key={booking.id}
            className="rounded-[16px] border border-[#e8e8e8] bg-white p-4"
          >
            {/* PLAYER */}
            <div className="flex items-center gap-3">
              {booking.profilePhoto ? (
                <img
                  src={booking.profilePhoto}
                  alt={booking.username}
                  className="h-11 w-11 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eeeeee] text-[16px] font-black">
                  {booking.username
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}

              <div className="flex-1">
                <p className="text-[15px] font-black text-[#111111]">
                  {index + 1}.{" "}
                  {booking.username}
                </p>

                <p className="mt-1 text-[12px] text-[#888888]">
                  Konami ID:{" "}
                  {booking.konamiId}
                </p>
              </div>

              <div
                className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                  booking.status ===
                  "confirmed"
                    ? "bg-[#e8f8ee] text-[#16834a]"
                    : "bg-[#fff4df] text-[#b56a00]"
                }`}
              >
                {booking.status}
              </div>
            </div>

            {/* DETAILS */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[10px] bg-[#f5f5f5] p-2">
                <p className="text-[10px] text-[#999999]">
                  Entry Fee
                </p>

                <p className="mt-1 text-[14px] font-black">
                  ₹{booking.entryFee}
                </p>
              </div>

              <div className="rounded-[10px] bg-[#f5f5f5] p-2">
                <p className="text-[10px] text-[#999999]">
                  Payment
                </p>

                <p className="mt-1 text-[14px] font-black uppercase">
                  {booking.paymentStatus}
                </p>
              </div>
            </div>

            {/* JOIN CODE */}
            <div className="mt-3 rounded-[10px] bg-[#f5f5f5] p-3">
              <p className="text-[10px] font-bold text-[#999999]">
                JOIN CODE
              </p>

              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-[20px] font-black tracking-[0.2em] text-[#111111]">
                  {booking.joinCode ||
                    "------"}
                </p>

                <button
                  type="button"
                  disabled={
                    !booking.joinCode
                  }
                  onClick={() =>
                    navigator.clipboard.writeText(
                      booking.joinCode
                    )
                  }
                  className="rounded-[9px] bg-white px-3 py-2 text-[11px] font-black shadow-sm disabled:opacity-40"
                >
                  COPY
                </button>
              </div>
            </div>

            {/* WHATSAPP */}
            <button
              type="button"
              disabled={
                !booking.joinCode
              }
              onClick={() => {
                const message =
                  `Hello ${booking.username},

Your eFootball tournament booking has been confirmed.

Tournament ID: ${tournamentId}

Username: ${booking.username}
Konami ID: ${booking.konamiId}

Tournament Date: ${tournament.date}
Tournament Time: ${tournament.time}

Your Join Code:
${booking.joinCode}

Please enter this code on the tournament verification page.

Thank you.`;

                const ADMIN_WHATSAPP_NUMBER =
                  "91XXXXXXXXXX";

                const whatsappUrl =
                  `https://wa.me/${ADMIN_WHATSAPP_NUMBER}` +
                  `?text=${encodeURIComponent(
                    message
                  )}`;

                window.open(
                  whatsappUrl,
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              className="mt-3 w-full rounded-[10px] bg-[#4bd17b] py-3 text-[12px] font-black text-[#111111] disabled:opacity-40"
            >
              SEND JOIN CODE ON WHATSAPP
            </button>
          </div>
        )
      )}
    </div>
  );
}