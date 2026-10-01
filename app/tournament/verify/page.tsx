"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

const ADMIN_WHATSAPP_NUMBER = "918848558182";

type Booking = {
  id: string;
  tournamentId: string;
  userId: string;
  username: string;
  konamiId: string;
  email: string;
  entryFee: number;
  rewardCoins: number;
  category: string;
  date: string;
  time: string;
  status: string;
  paymentStatus: string;
};

function VerifyTournamentContent() {
  const router = useRouter();

  const searchParams = useSearchParams();

  const bookingId = searchParams.get("bookingId");

  const [authUser, setAuthUser] = useState<User | null>(null);

  const [authLoading, setAuthLoading] = useState(true);

  const [booking, setBooking] = useState<Booking | null>(null);

  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(true);

  const [verifying, setVerifying] = useState(false);

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  // ------------------------------------------------------------
  // AUTH
  // ------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ------------------------------------------------------------
  // LOAD BOOKING
  // ------------------------------------------------------------

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      setLoading(false);

      return;
    }

    if (!bookingId) {
      setError("Booking ID is missing.");

      setLoading(false);

      return;
    }

    const loadBooking = async () => {
      try {
        setLoading(true);

        setError("");

        const bookingRef = doc(
          db,
          "tournamentRegistrations",
          bookingId
        );

        const bookingSnap = await getDoc(bookingRef);

        if (!bookingSnap.exists()) {
          setError("Booking not found.");

          setBooking(null);

          return;
        }

        const data = bookingSnap.data();

        if (data.userId !== authUser.uid) {
          setError(
            "You are not allowed to access this booking."
          );

          setBooking(null);

          return;
        }

        setBooking({
          id: bookingSnap.id,

          tournamentId: String(data.tournamentId || ""),

          userId: String(data.userId || ""),

          username: String(data.username || ""),

          konamiId: String(data.konamiId || ""),

          email: String(data.email || ""),

          entryFee: Number(data.entryFee || 0),

          rewardCoins: Number(data.rewardCoins || 0),

          category: String(data.category || ""),

          date: String(data.date || ""),

          time: String(data.time || ""),

          status: String(data.status || ""),

          paymentStatus: String(
            data.paymentStatus || ""
          ),
        });
      } catch (err) {
        console.error("LOAD BOOKING ERROR:", err);

        setError("Unable to load booking.");
      } finally {
        setLoading(false);
      }
    };

    loadBooking();
  }, [authUser, authLoading, bookingId]);

  // ------------------------------------------------------------
  // WHATSAPP
  // ------------------------------------------------------------

  const openWhatsApp = () => {
    if (!booking) return;

    const message = `Hello Admin,

I want to join the eFootball tournament.

Booking ID: ${booking.id}
Username: ${booking.username}
Konami ID: ${booking.konamiId}
Tournament Date: ${booking.date}
Tournament Time: ${booking.time}
Entry Fee: ₹${booking.entryFee}

Please verify my payment and send me the Join Code.

Thank you.`;

    const whatsappUrl =
      `https://wa.me/${ADMIN_WHATSAPP_NUMBER}` +
      `?text=${encodeURIComponent(message)}`;

    window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // ------------------------------------------------------------
  // VERIFY CODE
  // ------------------------------------------------------------

  const handleVerify = async () => {
    if (!booking || !authUser) return;

    const enteredCode = code.trim().toUpperCase();

    if (!enteredCode) {
      setError("Please enter the Join Code.");

      return;
    }

    if (enteredCode.length !== 6) {
      setError("Join Code must be 6 characters.");

      return;
    }

    setVerifying(true);

    setError("");

    setMessage("");

    try {
      const response = await fetch(
        "/api/tournament/verify",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            bookingId: booking.id,

            code: enteredCode,

            userId: authUser.uid,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(
          result.message ||
            "Verification failed. Please try again."
        );

        return;
      }

      setMessage(
        result.message ||
          "Booking confirmed successfully!"
      );

      setBooking((previous) =>
        previous
          ? {
              ...previous,

              status: "confirmed",

              paymentStatus: "verified",
            }
          : previous
      );

      setCode("");
    } catch (err) {
      console.error("VERIFY ERROR:", err);

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setVerifying(false);
    }
  };

  // ------------------------------------------------------------
  // LOADING
  // ------------------------------------------------------------

  if (authLoading || loading) {
    return (
      <PageFrame>
        <div className="flex min-h-[70vh] flex-col items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-[4px] border-[#dddddd] border-t-[#FFD600]" />

          <p className="mt-4 text-sm font-semibold text-[#666666]">
            Loading booking...
          </p>
        </div>
      </PageFrame>
    );
  }

  // ------------------------------------------------------------
  // LOGIN
  // ------------------------------------------------------------

  if (!authUser) {
    return (
      <PageFrame>
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4">
          <div className="w-full overflow-hidden rounded-[22px] border border-[#dddddd] bg-white shadow-[0_6px_20px_rgba(0,0,0,0.07)]">
            <div className="h-[6px] bg-[#FFD600]" />

            <div className="p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD600] text-2xl">
                🔐
              </div>

              <h2 className="mt-5 text-xl font-black text-[#111111]">
                Login Required
              </h2>

              <p className="mt-2 text-sm text-[#777777]">
                Please login to continue.
              </p>

              <button
                onClick={() => router.push("/login")}
                className="mt-6 w-full rounded-[14px] bg-[#FFD600] px-4 py-3 font-black text-[#111111] transition hover:bg-[#111111] hover:text-[#FFD600]"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      </PageFrame>
    );
  }

  // ------------------------------------------------------------
  // BOOKING ERROR
  // ------------------------------------------------------------

  if (!booking) {
    return (
      <PageFrame>
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4">
          <div className="w-full rounded-[22px] border border-red-200 bg-red-50 p-6 text-center">
            <h2 className="text-xl font-black text-[#111111]">
              Booking Not Found
            </h2>

            <p className="mt-2 text-sm text-red-700">
              {error || "Unable to find this booking."}
            </p>

            <button
              onClick={() => router.back()}
              className="mt-6 rounded-[14px] bg-[#111111] px-6 py-3 text-sm font-black text-[#FFD600]"
            >
              Go Back
            </button>
          </div>
        </div>
      </PageFrame>
    );
  }

  const isConfirmed =
    booking.status === "confirmed";

  // ------------------------------------------------------------
  // MAIN UI
  // ------------------------------------------------------------

  return (
    <PageFrame>
      <div className="mx-auto max-w-md px-4 py-7 pb-12">

        {/* HEADER */}

        <div className="text-center">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl font-black ${
              isConfirmed
                ? "bg-[#111111] text-[#FFD600]"
                : "bg-[#FFD600] text-[#111111]"
            }`}
          >
            ✓
          </div>

          <h1 className="mt-5 text-[25px] font-black text-[#111111]">
            {isConfirmed
              ? "Booking Confirmed"
              : "Verify Your Booking"}
          </h1>

          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#777777]">
            {isConfirmed
              ? "Your tournament slot has been confirmed successfully."
              : "Complete the verification to confirm your tournament slot."}
          </p>
        </div>

        {/* BOOKING CARD */}

        <div className="mt-6 overflow-hidden rounded-[22px] border border-[#dddddd] bg-white shadow-[0_5px_18px_rgba(0,0,0,0.06)]">
          <div className="h-[5px] bg-[#FFD600]" />

          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#999999]">
                  Booking ID
                </p>

                <p className="mt-1 break-all text-sm font-black text-[#111111]">
                  {booking.id}
                </p>
              </div>

              <div
                className={`shrink-0 rounded-full px-3 py-[7px] text-[10px] font-black uppercase tracking-[0.06em] ${
                  isConfirmed
                    ? "bg-[#111111] text-[#FFD600]"
                    : "bg-[#FFF4B8] text-[#111111]"
                }`}
              >
                {isConfirmed
                  ? "Confirmed"
                  : "Pending"}
              </div>
            </div>

            <div className="my-5 h-px bg-[#eeeeee]" />

            <div className="space-y-4">
              <InfoRow
                label="Username"
                value={booking.username}
              />

              <InfoRow
                label="Konami ID"
                value={booking.konamiId}
              />

              <InfoRow
                label="Entry Fee"
                value={`₹${booking.entryFee}`}
              />

              <InfoRow
                label="Tournament"
                value={`${booking.date} • ${booking.time}`}
              />

              <InfoRow
                label="Payment"
                value={booking.paymentStatus}
              />
            </div>

            <div className="mt-5 flex items-center justify-between rounded-[14px] bg-[#111111] px-4 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#FFD600]">
                  Reward
                </p>

                <p className="mt-1 text-base font-black text-white">
                  {booking.rewardCoins} eFootball Coins
                </p>
              </div>

              <span className="text-2xl">
                🏆
              </span>
            </div>
          </div>
        </div>

        {/* CONFIRMED */}

        {isConfirmed ? (
          <div className="mt-5 overflow-hidden rounded-[22px] border border-[#FFD600] bg-white shadow-[0_5px_18px_rgba(0,0,0,0.05)]">
            <div className="bg-[#FFD600] px-5 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-xl font-black text-[#FFD600]">
                ✓
              </div>

              <h2 className="mt-3 text-lg font-black text-[#111111]">
                Tournament Slot Confirmed
              </h2>
            </div>

            <div className="p-5 text-center">
              <p className="text-sm font-medium leading-6 text-[#555555]">
                You have successfully joined this tournament.
                Please wait for the tournament fixture and room details.
              </p>
            </div>
          </div>
        ) : (
          <>

            {/* INSTRUCTIONS */}

            <div className="mt-5 overflow-hidden rounded-[22px] border border-[#dddddd] bg-white shadow-[0_5px_18px_rgba(0,0,0,0.05)]">
              <div className="border-b border-[#eeeeee] px-5 py-4">
                <h2 className="text-sm font-black text-[#111111]">
                  How to Verify
                </h2>

                <p className="mt-1 text-[11px] text-[#888888]">
                  Follow these steps to confirm your slot.
                </p>
              </div>

              <div className="space-y-4 p-5">
                <Step
                  number="1"
                  text="Click the WhatsApp button below."
                />

                <Step
                  number="2"
                  text="Send the pre-filled message to the Admin."
                />

                <Step
                  number="3"
                  text="Complete the payment as instructed by the Admin."
                />

                <Step
                  number="4"
                  text="The Admin will verify your payment and send you the Join Code."
                />

                <Step
                  number="5"
                  text="Enter the Join Code below to confirm your booking."
                />
              </div>
            </div>

            {/* WHATSAPP */}

            <button
              onClick={openWhatsApp}
              className="mt-5 flex w-full items-center justify-center gap-3 rounded-[16px] bg-[#111111] px-5 py-4 text-sm font-black text-[#FFD600] shadow-[0_5px_14px_rgba(0,0,0,0.12)] transition hover:bg-[#222222] active:scale-[0.98]"
            >
              <span className="text-xl">
                ☏
              </span>

              Get Code on WhatsApp
            </button>

            {/* DIVIDER */}

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#dcdcdc]" />

              <span className="text-[10px] font-black tracking-[0.15em] text-[#999999]">
                ENTER CODE
              </span>

              <div className="h-px flex-1 bg-[#dcdcdc]" />
            </div>

            {/* CODE */}

            <div className="rounded-[22px] border border-[#dddddd] bg-white p-5 shadow-[0_5px_18px_rgba(0,0,0,0.05)]">
              <label className="mb-3 block text-sm font-black text-[#111111]">
                Join Code
              </label>

              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 6)
                  );

                  setError("");

                  setMessage("");
                }}
                placeholder="Enter 6-character code"
                maxLength={6}
                autoComplete="off"
                className="w-full rounded-[14px] border-2 border-[#e1e1e1] bg-[#f7f7f7] px-4 py-4 text-center text-xl font-black tracking-[0.35em] text-[#111111] outline-none transition placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-[#aaaaaa] focus:border-[#FFD600] focus:bg-white"
              />

              {/* ERROR */}

              {error && (
                <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">
                    {error}
                  </p>
                </div>
              )}

              {/* SUCCESS */}

              {message && (
                <div className="mt-4 rounded-[14px] border border-[#FFD600] bg-[#FFF8D6] p-4">
                  <p className="text-sm font-bold text-[#111111]">
                    {message}
                  </p>
                </div>
              )}

              {/* VERIFY */}

              <button
                onClick={handleVerify}
                disabled={
                  verifying ||
                  code.length !== 6
                }
                className="mt-4 w-full rounded-[14px] bg-[#FFD600] px-5 py-4 text-sm font-black text-[#111111] shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition hover:bg-[#111111] hover:text-[#FFD600] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {verifying
                  ? "Verifying..."
                  : "Verify & Confirm Booking"}
              </button>
            </div>

            <p className="mt-5 text-center text-xs font-medium leading-5 text-[#777777]">
              Your booking will remain pending until the Admin
              verifies your payment and provides the Join Code.
            </p>
          </>
        )}
      </div>
    </PageFrame>
  );
}

// ------------------------------------------------------------
// PAGE FRAME
// ------------------------------------------------------------

function PageFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f2f2f2] text-[#111111]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#FFD600] shadow-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4">
          <h1 className="text-lg font-black text-[#111111]">
            Tournament
          </h1>
        </div>
      </header>

      {children}
    </main>
  );
}

// ------------------------------------------------------------
// INFO ROW
// ------------------------------------------------------------

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-[#777777]">
        {label}
      </span>

      <span className="text-right text-sm font-black text-[#111111]">
        {value}
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// STEP
// ------------------------------------------------------------

function Step({
  number,
  text,
}: {
  number: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFD600] text-xs font-black text-[#111111]">
        {number}
      </div>

      <p className="pt-1 text-sm font-medium leading-5 text-[#555555]">
        {text}
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// PAGE
// ------------------------------------------------------------

export default function VerifyTournamentPage() {
  return (
    <Suspense
      fallback={
        <PageFrame>
          <div className="flex min-h-[70vh] flex-col items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-[4px] border-[#dddddd] border-t-[#FFD600]" />

            <p className="mt-4 text-sm font-semibold text-[#777777]">
              Loading...
            </p>
          </div>
        </PageFrame>
      }
    >
      <VerifyTournamentContent />
    </Suspense>
  );
}