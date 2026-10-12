"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type RequestTab =
  | "points"
  | "withdrawals";

type PointRequest = {
  id: string;
  userId: string;
  email: string;
  amount: number;
  points: number;
  status: string;
  createdAt?: unknown;
};

type WithdrawalRequest = {
  id: string;
  userId: string;
  email: string;
  amount: number;
  upiId: string;
  status: string;
  createdAt?: unknown;
};

export default function MoneyRequestsPage() {
  const router = useRouter();

  /* ---------------------------------------------
     ADMIN
  --------------------------------------------- */

  const [checkingAdmin, setCheckingAdmin] =
    useState(true);

  const [isAdmin, setIsAdmin] =
    useState(false);

  /* ---------------------------------------------
     TABS
  --------------------------------------------- */

  const [activeTab, setActiveTab] =
    useState<RequestTab>("points");

  /* ---------------------------------------------
     POINT REQUESTS
  --------------------------------------------- */

  const [pointRequests, setPointRequests] =
    useState<PointRequest[]>([]);

  const [
    loadingPointRequests,
    setLoadingPointRequests,
  ] = useState(false);

  /* ---------------------------------------------
     WITHDRAWAL REQUESTS
  --------------------------------------------- */

  const [
    withdrawalRequests,
    setWithdrawalRequests,
  ] = useState<WithdrawalRequest[]>([]);

  const [
    loadingWithdrawals,
    setLoadingWithdrawals,
  ] = useState(false);

  /* ---------------------------------------------
     PROCESSING
  --------------------------------------------- */

  const [
    processingRequestId,
    setProcessingRequestId,
  ] = useState("");

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  /* =============================================
     ADMIN CHECK
  ============================================= */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            router.replace("/login");
            return;
          }

          try {
            const adminRef = doc(
              db,
              "admins",
              user.uid
            );

            const adminSnap =
              await getDoc(adminRef);

            if (!adminSnap.exists()) {
              setIsAdmin(false);

              router.replace("/");

              return;
            }

            setIsAdmin(true);
            setCheckingAdmin(false);

            await Promise.all([
              loadPointRequests(),
              loadWithdrawalRequests(),
            ]);
          } catch (err) {
            console.error(
              "Admin check failed:",
              err
            );

            setIsAdmin(false);
            router.replace("/");
          }
        }
      );

    return () => unsubscribe();
  }, [router]);

  /* =============================================
     LOAD POINT REQUESTS
  ============================================= */

  async function loadPointRequests() {
    try {
      setLoadingPointRequests(true);
      setError("");

      const requestsQuery = query(
        collection(
          db,
          "pointRequests"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      );

      const snapshot =
        await getDocs(
          requestsQuery
        );

      const requests: PointRequest[] =
        snapshot.docs.map(
          (item) => {
            const data =
              item.data();

            return {
              id: item.id,

              userId: String(
                data.userId || ""
              ),

              email: String(
                data.email || ""
              ),

              amount: Number(
                data.amount || 0
              ),

              points: Number(
                data.points || 0
              ),

              status: String(
                data.status ||
                  "pending"
              ),

              createdAt:
                data.createdAt,
            };
          }
        );

      setPointRequests(
        requests
      );
    } catch (err) {
      console.error(
        "Failed to load point requests:",
        err
      );

      setError(
        "Failed to load point requests."
      );
    } finally {
      setLoadingPointRequests(
        false
      );
    }
  }

  /* =============================================
     LOAD WITHDRAWAL REQUESTS
  ============================================= */

  async function loadWithdrawalRequests() {
    try {
      setLoadingWithdrawals(
        true
      );

      setError("");

      const requestsQuery = query(
        collection(
          db,
          "withdrawRequests"
        ),
        orderBy(
          "createdAt",
          "desc"
        )
      );

      const snapshot =
        await getDocs(
          requestsQuery
        );

      const requests: WithdrawalRequest[] =
        snapshot.docs.map(
          (item) => {
            const data =
              item.data();

            return {
              id: item.id,

              userId: String(
                data.userId || ""
              ),

              email: String(
                data.email || ""
              ),

              amount: Number(
                data.amount || 0
              ),

              upiId: String(
                data.upiId || ""
              ),

              status: String(
                data.status ||
                  "pending"
              ),

              createdAt:
                data.createdAt,
            };
          }
        );

      setWithdrawalRequests(
        requests
      );
    } catch (err) {
      console.error(
        "Failed to load withdrawals:",
        err
      );

      /*
        withdrawRequests collection
        ഇതുവരെ create ചെയ്തിട്ടില്ലെങ്കിൽ
        page crash ആവാതിരിക്കാനാണ്.
      */

      setWithdrawalRequests(
        []
      );
    } finally {
      setLoadingWithdrawals(
        false
      );
    }
  }

  /* =============================================
     APPROVE POINT REQUEST
  ============================================= */

  async function approvePointRequest(
    request: PointRequest
  ) {
    const confirmed =
      window.confirm(
        `Payment ₹${request.amount} received?\n\nAdd ${request.points} points to this user?`
      );

    if (!confirmed) return;

    try {
      setProcessingRequestId(
        request.id
      );

      setMessage("");
      setError("");

      await runTransaction(
        db,
        async (transaction) => {
          const requestRef = doc(
            db,
            "pointRequests",
            request.id
          );

          const requestSnap =
            await transaction.get(
              requestRef
            );

          if (
            !requestSnap.exists()
          ) {
            throw new Error(
              "Point request not found."
            );
          }

          const requestData =
            requestSnap.data();

          if (
            requestData.status !==
            "pending"
          ) {
            throw new Error(
              "This request has already been processed."
            );
          }

          const userId = String(
            requestData.userId ||
              ""
          );

          if (!userId) {
            throw new Error(
              "User ID missing."
            );
          }

          const pointsToAdd =
            Number(
              requestData.points ||
                0
            );

          if (
            pointsToAdd <= 0
          ) {
            throw new Error(
              "Invalid points amount."
            );
          }

          const userRef = doc(
            db,
            "users",
            userId
          );

          const userSnap =
            await transaction.get(
              userRef
            );

          if (
            !userSnap.exists()
          ) {
            throw new Error(
              "User account not found."
            );
          }

          const currentBalance =
            Number(
              userSnap.data()
                .pointsBalance ||
                0
            );

          transaction.update(
            userRef,
            {
              pointsBalance:
                currentBalance +
                pointsToAdd,
            }
          );

          transaction.update(
            requestRef,
            {
              status:
                "approved",

              approvedAt:
                serverTimestamp(),

              approvedBy:
                auth.currentUser
                  ?.uid || "",

              updatedAt:
                serverTimestamp(),
            }
          );
        }
      );

      setMessage(
        `${request.points} points added successfully.`
      );

      await loadPointRequests();
    } catch (err) {
      console.error(
        "Point approval failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to approve point request."
      );
    } finally {
      setProcessingRequestId(
        ""
      );
    }
  }

  /* =============================================
     REJECT POINT REQUEST
  ============================================= */

  async function rejectPointRequest(
    request: PointRequest
  ) {
    const confirmed =
      window.confirm(
        `Reject this ₹${request.amount} point request?`
      );

    if (!confirmed) return;

    try {
      setProcessingRequestId(
        request.id
      );

      setMessage("");
      setError("");

      await runTransaction(
        db,
        async (transaction) => {
          const requestRef = doc(
            db,
            "pointRequests",
            request.id
          );

          const requestSnap =
            await transaction.get(
              requestRef
            );

          if (
            !requestSnap.exists()
          ) {
            throw new Error(
              "Request not found."
            );
          }

          if (
            requestSnap.data()
              .status !==
            "pending"
          ) {
            throw new Error(
              "This request has already been processed."
            );
          }

          transaction.update(
            requestRef,
            {
              status:
                "rejected",

              rejectedAt:
                serverTimestamp(),

              rejectedBy:
                auth.currentUser
                  ?.uid || "",

              updatedAt:
                serverTimestamp(),
            }
          );
        }
      );

      setMessage(
        "Point request rejected."
      );

      await loadPointRequests();
    } catch (err) {
      console.error(
        "Point rejection failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to reject request."
      );
    } finally {
      setProcessingRequestId(
        ""
      );
    }
  }

  /* =============================================
     MARK WITHDRAWAL AS PAID
  ============================================= */

  async function markWithdrawalPaid(
    request: WithdrawalRequest
  ) {
    const confirmed =
      window.confirm(
        `Have you sent ₹${request.amount} to ${request.upiId}?\n\nMark this withdrawal as paid?`
      );

    if (!confirmed) return;

    try {
      setProcessingRequestId(
        request.id
      );

      setMessage("");
      setError("");

      await runTransaction(
        db,
        async (transaction) => {
          const requestRef = doc(
            db,
            "withdrawRequests",
            request.id
          );

          const requestSnap =
            await transaction.get(
              requestRef
            );

          if (
            !requestSnap.exists()
          ) {
            throw new Error(
              "Withdrawal request not found."
            );
          }

          const data =
            requestSnap.data();

          if (
            data.status !==
            "pending"
          ) {
            throw new Error(
              "This withdrawal has already been processed."
            );
          }

          /*
            IMPORTANT:

            winningsBalance deduction
            user withdrawal request create
            ചെയ്യുന്ന സമയത്ത് transaction വഴി
            reserve/deduct ചെയ്യുന്നതാണ് safest.

            അതുകൊണ്ട് ഇവിടെ വീണ്ടും
            winningsBalance കുറയ്ക്കുന്നില്ല.
          */

          transaction.update(
            requestRef,
            {
              status: "paid",

              paidAt:
                serverTimestamp(),

              paidBy:
                auth.currentUser
                  ?.uid || "",

              updatedAt:
                serverTimestamp(),
            }
          );
        }
      );

      setMessage(
        `₹${request.amount} withdrawal marked as paid.`
      );

      await loadWithdrawalRequests();
    } catch (err) {
      console.error(
        "Withdrawal update failed:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to update withdrawal."
      );
    } finally {
      setProcessingRequestId(
        ""
      );
    }
  }

  /* =============================================
     REJECT WITHDRAWAL
  ============================================= */

  async function rejectWithdrawal(
  request: WithdrawalRequest
) {
  const confirmed = window.confirm(
    `Reject ₹${request.amount} withdrawal?\n\n₹${request.amount} will be returned to the user's winnings balance.`
  );

  if (!confirmed) return;

  try {
    setProcessingRequestId(request.id);
    setMessage("");
    setError("");

    await runTransaction(
      db,
      async (transaction) => {
        /* =========================
           REQUEST
        ========================= */

        const requestRef = doc(
          db,
          "withdrawRequests",
          request.id
        );

        const requestSnap =
          await transaction.get(
            requestRef
          );

        if (!requestSnap.exists()) {
          throw new Error(
            "Withdrawal request not found."
          );
        }

        const requestData =
          requestSnap.data();

        console.log(
          "Withdrawal request:",
          requestData
        );

        /* =========================
           CHECK STATUS
        ========================= */

        if (
          requestData.status !==
          "pending"
        ) {
          throw new Error(
            `Cannot refund. Current status: ${requestData.status}`
          );
        }

        /* =========================
           USER + AMOUNT
        ========================= */

        const userId =
          requestData.userId;

        const refundAmount =
          Number(
            requestData.amount
          );

        if (!userId) {
          throw new Error(
            "Withdrawal request has no userId."
          );
        }

        if (
          !refundAmount ||
          refundAmount <= 0
        ) {
          throw new Error(
            "Invalid withdrawal amount."
          );
        }

        /* =========================
           USER DOCUMENT
        ========================= */

        const userRef = doc(
          db,
          "users",
          userId
        );

        const userSnap =
          await transaction.get(
            userRef
          );

        if (!userSnap.exists()) {
          throw new Error(
            `User document not found: ${userId}`
          );
        }

        const userData =
          userSnap.data();

        const currentWinnings =
          Number(
            userData.winningsBalance ??
              0
          );

        const newBalance =
          currentWinnings +
          refundAmount;

        console.log(
          "Refund:",
          {
            userId,
            currentWinnings,
            refundAmount,
            newBalance,
          }
        );

        /* =========================
           REFUND USER
        ========================= */

        transaction.update(
          userRef,
          {
            winningsBalance:
              newBalance,
          }
        );

        /* =========================
           UPDATE REQUEST
        ========================= */

        transaction.update(
          requestRef,
          {
            status: "rejected",

            refunded: true,

            refundedAmount:
              refundAmount,

            balanceBeforeRefund:
              currentWinnings,

            balanceAfterRefund:
              newBalance,

            rejectedAt:
              serverTimestamp(),

            rejectedBy:
              auth.currentUser?.uid ??
              "",

            updatedAt:
              serverTimestamp(),
          }
        );
      }
    );

    setMessage(
      `Withdrawal rejected. ₹${request.amount} refunded successfully.`
    );

    await loadWithdrawalRequests();
  } catch (err) {
    console.error(
      "REFUND ERROR:",
      err
    );

    setError(
      err instanceof Error
        ? err.message
        : "Withdrawal refund failed."
    );
  } finally {
    setProcessingRequestId("");
  }
}

  /* =============================================
     COUNTS
  ============================================= */

  const pendingPointRequests =
    pointRequests.filter(
      (request) =>
        request.status ===
        "pending"
    );

  const pendingWithdrawals =
    withdrawalRequests.filter(
      (request) =>
        request.status ===
        "pending"
    );

  /* =============================================
     LOADING
  ============================================= */

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

  /* =============================================
     UI
  ============================================= */

  return (
    <main className="min-h-screen bg-[#f4f6f9]">

      <div className="mx-auto min-h-screen max-w-md bg-[#f8f9fb]">

        {/* HEADER */}

        <header className="sticky top-0 z-50 border-b border-[#e5e8ed] bg-white">

          <div className="flex h-[68px] items-center justify-between px-4">

            <div className="flex items-center gap-3">

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/admin"
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e1e6ec] bg-white text-[15px] font-black text-[#071426]"
              >
                ←
              </button>

              <div>

                <p className="text-[8px] font-black tracking-[0.22em] text-[#0879d1]">
                  ADMIN PANEL
                </p>

                <h1 className="mt-0.5 text-[18px] font-black tracking-[-0.03em] text-[#071426]">
                  Money Requests
                </h1>

              </div>

            </div>

            <button
              type="button"
              onClick={() => {
                loadPointRequests();
                loadWithdrawalRequests();
              }}
              className="rounded-[9px] border border-[#e1e6ec] bg-white px-3 py-2 text-[8px] font-black text-[#566173]"
            >
              REFRESH
            </button>

          </div>

        </header>

        <div className="px-4 pb-12">

          {/* SUMMARY */}

          <section className="pt-5">

            <div className="grid grid-cols-2 gap-3">

              <div className="rounded-[16px] bg-[#071426] p-4">

                <p className="text-[8px] font-black uppercase tracking-wide text-white/50">
                  Add Points
                </p>

                <div className="mt-3 flex items-end justify-between">

                  <p className="text-[26px] font-black text-white">
                    {
                      pendingPointRequests.length
                    }
                  </p>

                  <span className="text-[22px]">
                    🪙
                  </span>

                </div>

                <p className="mt-1 text-[8px] font-bold text-white/45">
                  Pending requests
                </p>

              </div>

              <div className="rounded-[16px] bg-[#FFD600] p-4">

                <p className="text-[8px] font-black uppercase tracking-wide text-[#111111]/50">
                  Withdrawals
                </p>

                <div className="mt-3 flex items-end justify-between">

                  <p className="text-[26px] font-black text-[#111111]">
                    {
                      pendingWithdrawals.length
                    }
                  </p>

                  <span className="text-[22px]">
                    💰
                  </span>

                </div>

                <p className="mt-1 text-[8px] font-bold text-[#111111]/45">
                  Pending requests
                </p>

              </div>

            </div>

          </section>

          {/* TABS */}

          <section className="mt-5">

            <div className="grid grid-cols-2 rounded-[13px] bg-[#e9edf2] p-1">

              <button
                type="button"
                onClick={() => {
                  setActiveTab(
                    "points"
                  );

                  setMessage("");
                  setError("");
                }}
                className={`rounded-[10px] py-3 text-[9px] font-black transition ${
                  activeTab ===
                  "points"
                    ? "bg-white text-[#071426] shadow-sm"
                    : "text-[#8a94a4]"
                }`}
              >
                ADD POINTS
                {pendingPointRequests.length >
                  0 && (
                  <span className="ml-1.5 rounded-full bg-[#FFD600] px-1.5 py-0.5 text-[7px] text-[#111111]">
                    {
                      pendingPointRequests.length
                    }
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab(
                    "withdrawals"
                  );

                  setMessage("");
                  setError("");
                }}
                className={`rounded-[10px] py-3 text-[9px] font-black transition ${
                  activeTab ===
                  "withdrawals"
                    ? "bg-white text-[#071426] shadow-sm"
                    : "text-[#8a94a4]"
                }`}
              >
                WITHDRAWALS
                {pendingWithdrawals.length >
                  0 && (
                  <span className="ml-1.5 rounded-full bg-[#FFD600] px-1.5 py-0.5 text-[7px] text-[#111111]">
                    {
                      pendingWithdrawals.length
                    }
                  </span>
                )}
              </button>

            </div>

          </section>

          {/* MESSAGE */}

          {message && (
            <div className="mt-4 rounded-[11px] bg-[#edf9f2] px-3 py-3">

              <p className="text-[10px] font-bold text-[#16834a]">
                {message}
              </p>

            </div>
          )}

          {/* ERROR */}

          {error && (
            <div className="mt-4 rounded-[11px] bg-[#fff1f1] px-3 py-3">

              <p className="text-[10px] font-bold text-[#d33b3b]">
                {error}
              </p>

            </div>
          )}

          {/* ==================================
              ADD POINT REQUESTS
          ================================== */}

          {activeTab === "points" && (

            <section className="mt-5">

              <div className="mb-3">

                <h2 className="text-[16px] font-black text-[#071426]">
                  Add Point Requests
                </h2>

                <p className="mt-1 text-[9px] font-medium text-[#8a94a4]">
                  Verify payment before approving points.
                </p>

              </div>

              {loadingPointRequests ? (

                <LoadingCard text="Loading point requests..." />

              ) : pendingPointRequests.length ===
                0 ? (

                <EmptyCard
                  icon="🪙"
                  title="No pending requests"
                  description="New point purchase requests will appear here."
                />

              ) : (

                <div className="space-y-3">

                  {pendingPointRequests.map(
                    (request) => (

                      <div
                        key={
                          request.id
                        }
                        className="rounded-[17px] border border-[#e3e7ed] bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)]"
                      >

                        <div className="flex items-start justify-between gap-3">

                          <div className="min-w-0">

                            <p className="text-[8px] font-black uppercase text-[#9aa3b1]">
                              User
                            </p>

                            <p className="mt-1 truncate text-[11px] font-black text-[#071426]">
                              {request.email ||
                                request.userId}
                            </p>

                          </div>

                          <span className="shrink-0 rounded-full bg-[#fff7d6] px-3 py-1.5 text-[7px] font-black text-[#9b7600]">
                            PENDING
                          </span>

                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">

                          <div className="rounded-[11px] bg-[#f6f8fa] p-3">

                            <p className="text-[8px] font-bold text-[#9aa3b1]">
                              PAYMENT
                            </p>

                            <p className="mt-1 text-[17px] font-black text-[#071426]">
                              ₹
                              {
                                request.amount
                              }
                            </p>

                          </div>

                          <div className="rounded-[11px] bg-[#fff9d9] p-3">

                            <p className="text-[8px] font-bold text-[#9b8300]">
                              USER GETS
                            </p>

                            <p className="mt-1 text-[17px] font-black text-[#071426]">
                              {
                                request.points
                              }{" "}
                              P
                            </p>

                          </div>

                        </div>

                        <div className="mt-3 rounded-[9px] bg-[#f8f9fb] px-3 py-2">

                          <p className="break-all text-[7px] font-medium text-[#a0a8b4]">
                            ID:{" "}
                            {
                              request.id
                            }
                          </p>

                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              rejectPointRequest(
                                request
                              )
                            }
                            disabled={
                              processingRequestId ===
                              request.id
                            }
                            className="rounded-[11px] border border-[#f0d5d5] bg-[#fff7f7] py-3 text-[9px] font-black text-[#d33b3b] disabled:opacity-50"
                          >
                            REJECT
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              approvePointRequest(
                                request
                              )
                            }
                            disabled={
                              processingRequestId ===
                              request.id
                            }
                            className="rounded-[11px] bg-[#16834a] py-3 text-[9px] font-black text-white disabled:opacity-50"
                          >
                            {processingRequestId ===
                            request.id
                              ? "PROCESSING..."
                              : "APPROVE"}
                          </button>

                        </div>

                      </div>

                    )
                  )}

                </div>
              )}

            </section>

          )}

          {/* ==================================
              WITHDRAWALS
          ================================== */}

          {activeTab ===
            "withdrawals" && (

            <section className="mt-5">

              <div className="mb-3">

                <h2 className="text-[16px] font-black text-[#071426]">
                  Withdrawal Requests
                </h2>

                <p className="mt-1 text-[9px] font-medium text-[#8a94a4]">
                  Send payment to the UPI ID before marking as paid.
                </p>

              </div>

              {loadingWithdrawals ? (

                <LoadingCard text="Loading withdrawal requests..." />

              ) : pendingWithdrawals.length ===
                0 ? (

                <EmptyCard
                  icon="💰"
                  title="No withdrawals"
                  description="New withdrawal requests will appear here."
                />

              ) : (

                <div className="space-y-3">

                  {pendingWithdrawals.map(
                    (request) => (

                      <div
                        key={
                          request.id
                        }
                        className="rounded-[17px] border border-[#e3e7ed] bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)]"
                      >

                        <div className="flex items-start justify-between gap-3">

                          <div className="min-w-0">

                            <p className="text-[8px] font-black uppercase text-[#9aa3b1]">
                              User
                            </p>

                            <p className="mt-1 truncate text-[11px] font-black text-[#071426]">
                              {request.email ||
                                request.userId}
                            </p>

                          </div>

                          <span className="shrink-0 rounded-full bg-[#fff7d6] px-3 py-1.5 text-[7px] font-black text-[#9b7600]">
                            PENDING
                          </span>

                        </div>

                        <div className="mt-4 rounded-[12px] bg-[#071426] p-4">

                          <p className="text-[8px] font-bold text-white/45">
                            WITHDRAW AMOUNT
                          </p>

                          <p className="mt-1 text-[25px] font-black text-white">
                            ₹
                            {
                              request.amount
                            }
                          </p>

                        </div>

                        <div className="mt-2 rounded-[11px] bg-[#f6f8fa] p-3">

                          <p className="text-[8px] font-bold text-[#9aa3b1]">
                            UPI ID
                          </p>

                          <p className="mt-1 break-all text-[12px] font-black text-[#071426]">
                            {request.upiId ||
                              "Not provided"}
                          </p>

                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              rejectWithdrawal(
                                request
                              )
                            }
                            disabled={
                              processingRequestId ===
                              request.id
                            }
                            className="rounded-[11px] border border-[#f0d5d5] bg-[#fff7f7] py-3 text-[9px] font-black text-[#d33b3b] disabled:opacity-50"
                          >
                            REJECT
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              markWithdrawalPaid(
                                request
                              )
                            }
                            disabled={
                              processingRequestId ===
                              request.id
                            }
                            className="rounded-[11px] bg-[#16834a] py-3 text-[9px] font-black text-white disabled:opacity-50"
                          >
                            {processingRequestId ===
                            request.id
                              ? "PROCESSING..."
                              : "MARK PAID"}
                          </button>

                        </div>

                      </div>

                    )
                  )}

                </div>
              )}

            </section>

          )}

        </div>

      </div>

    </main>
  );
}

/* =============================================
   LOADING CARD
============================================= */

function LoadingCard({
  text,
}: {
  text: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#e3e7ed] bg-white p-7 text-center">

      <div className="mx-auto h-6 w-6 animate-spin rounded-full border-[2px] border-[#dce2e9] border-t-[#0879d1]" />

      <p className="mt-3 text-[10px] font-bold text-[#8a94a4]">
        {text}
      </p>

    </div>
  );
}

/* =============================================
   EMPTY CARD
============================================= */

function EmptyCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-[#d8dee6] bg-white p-8 text-center">

      <div className="text-[28px]">
        {icon}
      </div>

      <p className="mt-2 text-[12px] font-black text-[#071426]">
        {title}
      </p>

      <p className="mt-1 text-[9px] font-medium text-[#8a94a4]">
        {description}
      </p>

    </div>
  );
}