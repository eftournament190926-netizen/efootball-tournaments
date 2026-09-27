import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { bookingId, code, userId } = body;

    // Basic validation
    if (!bookingId || !code || !userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing verification details.",
        },
        { status: 400 }
      );
    }

    // Get booking
    const bookingRef = adminDb
      .collection("tournamentRegistrations")
      .doc(bookingId);

    const bookingSnap = await bookingRef.get();

    if (!bookingSnap.exists) {
      return NextResponse.json(
        {
          success: false,
          message: "Booking not found.",
        },
        { status: 404 }
      );
    }

    const booking = bookingSnap.data();

    if (!booking) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid booking.",
        },
        { status: 400 }
      );
    }

    // Make sure this booking belongs to this user
    if (booking.userId !== userId) {
      return NextResponse.json(
        {
          success: false,
          message: "You are not allowed to verify this booking.",
        },
        { status: 403 }
      );
    }

    // Already confirmed
    if (booking.status === "confirmed") {
      return NextResponse.json({
        success: true,
        message: "Booking is already confirmed.",
        alreadyConfirmed: true,
      });
    }

    // Compare Join Code
    const savedCode = String(booking.joinCode || "")
      .trim()
      .toUpperCase();

    const enteredCode = String(code || "")
      .trim()
      .toUpperCase();

    if (!savedCode || savedCode !== enteredCode) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid Join Code.",
        },
        { status: 400 }
      );
    }

    // Get tournament ID
    const tournamentId = String(
      booking.tournamentId || ""
    ).trim();

    if (!tournamentId) {
      return NextResponse.json(
        {
          success: false,
          message: "Tournament ID is missing.",
        },
        { status: 400 }
      );
    }

    // Tournament reference
    const tournamentRef = adminDb
      .collection("tournaments")
      .doc(tournamentId);

    // Transaction
    await adminDb.runTransaction(async (transaction) => {
      const tournamentSnap =
        await transaction.get(tournamentRef);

      if (!tournamentSnap.exists) {
        throw new Error("Tournament not found.");
      }

      const tournament = tournamentSnap.data();

      const registeredPlayers = Number(
        tournament?.registeredPlayers || 0
      );

      const maxPlayers = Number(
        tournament?.maxPlayers || 0
      );

      // Check tournament capacity
      if (
        maxPlayers > 0 &&
        registeredPlayers >= maxPlayers
      ) {
        throw new Error("Tournament is already full.");
      }

      // Confirm booking
      transaction.update(bookingRef, {
        status: "confirmed",
        paymentStatus: "verified",
        verifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Increase registered player count
      transaction.update(tournamentRef, {
        registeredPlayers:
          FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      success: true,
      message: "Booking confirmed successfully!",
    });
  } catch (error) {
    console.error(
      "VERIFY BOOKING ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Verification failed.",
      },
      { status: 500 }
    );
  }
}