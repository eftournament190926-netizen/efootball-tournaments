"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  collection,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";

/* =================================================
   TYPES
================================================= */

type TournamentStats = {
  matches?: number;
  wins?: number;
  losses?: number;
  goals?: number;
  conceded?: number;
  tournamentPlayed?: number;
  tournamentWon?: number;
  tournamentRunner?: number;
};

type UserData = {
  username?: string;
  konamiId?: string;
  email?: string;
  profilePhoto?: string;
  tournamentStats?: TournamentStats;
};

type PlayerRanking = {
  rank: number;
  points: number;
  totalPlayers: number;
};

type RankingPlayer = {
  id: string;
  points: number;
  goalDifference: number;
  goals: number;
  wins: number;
};

const PLAYER_AVATARS = [
  {
    id: "raphinha",
    name: "Raphinha",
    image: "/player-avatars/raphinha.png",
  },
  {
    id: "ronaldinho",
    name: "Ronaldinho",
    image: "/player-avatars/ronaldinho.png",
  },
  {
    id: "ronaldo",
    name: "Ronaldo",
    image: "/player-avatars/ronaldo.png",
  },
  {
    id: "coutinho",
    name: "Coutinho",
    image: "/player-avatars/coutinho.png",
  },
  {
    id: "yamal",
    name: "Yamal",
    image: "/player-avatars/yamal.png",
  },
  {
    id: "beckham",
    name: "Beckham",
    image: "/player-avatars/beckham.png",
  },
  {
    id: "di-maria",
    name: "Di Maria",
    image: "/player-avatars/di-maria.png",
  },
  {
    id: "dybala",
    name: "Dybala",
    image: "/player-avatars/dybala.png",
  },
  {
    id: "messi",
    name: "Messi",
    image: "/player-avatars/messi.png",
  },
  {
    id: "neymar",
    name: "Neymar",
    image: "/player-avatars/neymar.png",
  },
];

/* =================================================
   PROFILE PAGE
================================================= */

export default function ProfilePage() {
  const router = useRouter();

  const [userData, setUserData] =
    useState<UserData | null>(null);

  const [loading, setLoading] = useState(true);

  const [loggingOut, setLoggingOut] = useState(false);

  /* AVATAR STATES */

  const [showAvatarPicker, setShowAvatarPicker] =
    useState(false);

  const [selectedAvatar, setSelectedAvatar] =
    useState("");

  const [savingAvatar, setSavingAvatar] =
    useState(false);

  const [avatarError, setAvatarError] =
    useState("");

  /* USERNAME STATES */

  const [showUsernameEditor, setShowUsernameEditor] =
    useState(false);

  const [usernameInput, setUsernameInput] =
    useState("");

  const [savingUsername, setSavingUsername] =
    useState(false);

  const [usernameError, setUsernameError] =
    useState("");

  /* RANKING STATES */

  const [playerRanking, setPlayerRanking] =
    useState<PlayerRanking | null>(null);

  const [rankingLoading, setRankingLoading] =
    useState(true);

  /* =================================================
     LOAD PROFILE + RANKING
  ================================================= */

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          if (!cancelled) {
            setLoading(false);
            setRankingLoading(false);
            router.replace("/login");
          }
          return;
        }

        if (cancelled) return;

        setLoading(true);
        setRankingLoading(true);

        /* LOAD PROFILE */

        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (cancelled) return;

          if (userSnap.exists()) {
            setUserData({
              ...(userSnap.data() as UserData),
              email: user.email || "",
            });
          } else {
            setUserData({
              email: user.email || "",
            });
          }
        } catch (error) {
          console.error("Failed to load profile:", error);

          if (!cancelled) {
            setUserData({
              email: user.email || "",
            });
          }
        }

        if (cancelled) return;

        setLoading(false);

        /* LOAD RANKING */

        try {
          const usersSnapshot = await getDocs(
            collection(db, "users")
          );

          if (cancelled) return;

          const rankedPlayers: RankingPlayer[] = [];

          usersSnapshot.forEach((userDocument) => {
            const data = userDocument.data();

            const stats: TournamentStats =
              data.tournamentStats || {};

            const matches = Number(stats.matches || 0);

            const tournamentPlayed = Number(
              stats.tournamentPlayed || 0
            );

            // Players without tournament activity are excluded.
            if (
              matches === 0 &&
              tournamentPlayed === 0
            ) {
              return;
            }

            const wins = Number(stats.wins || 0);
            const losses = Number(stats.losses || 0);
            const goals = Number(stats.goals || 0);
            const conceded = Number(stats.conceded || 0);

            const tournamentWon = Number(
              stats.tournamentWon || 0
            );

            const tournamentRunner = Number(
              stats.tournamentRunner || 0
            );

            const points =
              wins * 3 -
              losses * 2 +
              tournamentWon * 3 +
              tournamentRunner * 2;

            rankedPlayers.push({
              id: userDocument.id,
              points,
              goalDifference: goals - conceded,
              goals,
              wins,
            });
          });

          /* SORT RANKING */

          rankedPlayers.sort((a, b) => {
            if (a.points !== b.points) {
              return b.points - a.points;
            }

            if (
              a.goalDifference !== b.goalDifference
            ) {
              return (
                b.goalDifference - a.goalDifference
              );
            }

            if (a.goals !== b.goals) {
              return b.goals - a.goals;
            }

            if (a.wins !== b.wins) {
              return b.wins - a.wins;
            }

            return 0;
          });

          /* FIND CURRENT USER */

          const playerIndex = rankedPlayers.findIndex(
            (player) => player.id === user.uid
          );

          if (!cancelled) {
            if (playerIndex !== -1) {
              setPlayerRanking({
                rank: playerIndex + 1,
                points: rankedPlayers[playerIndex].points,
                totalPlayers: rankedPlayers.length,
              });
            } else {
              setPlayerRanking(null);
            }
          }
        } catch (error) {
          console.error(
            "Failed to load player ranking:",
            error
          );

          if (!cancelled) {
            setPlayerRanking(null);
          }
        } finally {
          if (!cancelled) {
            setRankingLoading(false);
          }
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  /* =================================================
     LOGOUT
  ================================================= */

  async function handleLogout() {
    if (loggingOut) return;

    try {
      setLoggingOut(true);

      await signOut(auth);

      router.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      setLoggingOut(false);
    }
  }

  /* =================================================
     SAVE AVATAR
  ================================================= */

  async function handleSaveAvatar() {
    const user = auth.currentUser;

    if (!user) return;

    if (!selectedAvatar) {
      setAvatarError("Please select an avatar.");
      return;
    }

    try {
      setSavingAvatar(true);
      setAvatarError("");

      const userRef = doc(db, "users", user.uid);

      await updateDoc(userRef, {
        profilePhoto: selectedAvatar,
        updatedAt: serverTimestamp(),
      });

      setUserData((current) => {
        if (!current) return current;

        return {
          ...current,
          profilePhoto: selectedAvatar,
        };
      });

      setShowAvatarPicker(false);
    } catch (error) {
      console.error("Failed to update avatar:", error);

      setAvatarError(
        "Failed to update avatar. Please try again."
      );
    } finally {
      setSavingAvatar(false);
    }
  }

  /* =================================================
     SAVE USERNAME
  ================================================= */

  async function handleSaveUsername() {
    const user = auth.currentUser;

    if (!user) return;

    const newUsername = usernameInput.trim();

    if (!newUsername) {
      setUsernameError("Please enter a username.");
      return;
    }

    if (newUsername.length < 3) {
      setUsernameError(
        "Username must be at least 3 characters."
      );
      return;
    }

    if (newUsername.length > 20) {
      setUsernameError(
        "Username cannot exceed 20 characters."
      );
      return;
    }

    try {
      setSavingUsername(true);
      setUsernameError("");

      const userRef = doc(db, "users", user.uid);

      await updateDoc(userRef, {
        username: newUsername,
        updatedAt: serverTimestamp(),
      });

      setUserData((current) =>
        current
          ? {
              ...current,
              username: newUsername,
            }
          : current
      );

      setShowUsernameEditor(false);
    } catch (error) {
      console.error("Username update failed:", error);

      setUsernameError(
        "Failed to update username. Please try again."
      );
    } finally {
      setSavingUsername(false);
    }
  }

  /* =================================================
     LOADING
  ================================================= */

  if (loading) {
    return (
      <main className="min-h-screen bg-[#eeeeee]">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-[#f2f2f2]">
          <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-[#FFD600] border-t-[#111111]" />

            <p className="mt-3 text-[11px] font-bold text-[#777777]">
              Loading profile...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /* =================================================
     STATS
  ================================================= */

  const tournament = userData?.tournamentStats || {};

  const matches = tournament.matches || 0;
  const wins = tournament.wins || 0;
  const losses = tournament.losses || 0;
  const goals = tournament.goals || 0;
  const conceded = tournament.conceded || 0;

  const goalDifference = goals - conceded;

  /* =================================================
     PAGE
  ================================================= */

  return (
    <main className="min-h-screen bg-[#eeeeee]">
      <div className="mx-auto min-h-screen max-w-md bg-[#f2f2f2] pb-[82px] shadow-[0_0_40px_rgba(0,0,0,0.08)]">

        {/* HEADER */}

        <section className="relative overflow-hidden bg-[#FFD600] px-5 pb-8 pt-6 text-[#111111]">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-black/[0.05]" />

          <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-black/[0.04]" />

          {/* TOP HEADER */}

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-black/50">
                eFootball
              </p>

              <h1 className="mt-1 text-[25px] font-black tracking-tight">
                Profile
              </h1>
            </div>

            <div className="max-w-[180px] rounded-full bg-[#111111] px-3 py-[7px]">
              <p className="truncate text-[9px] font-black text-[#FFD600]">
                {userData?.email || "Email"}
              </p>
            </div>
          </div>

          {/* PROFILE USER */}

          <div className="relative z-10 mt-8 flex items-center gap-4">

            {/* PROFILE PHOTO */}

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSelectedAvatar(
                    userData?.profilePhoto || ""
                  );

                  setAvatarError("");
                  setShowAvatarPicker(true);
                }}
                className="relative block"
                aria-label="Change profile avatar"
              >
                <div className="h-[86px] w-[86px] shrink-0 overflow-hidden rounded-full border-[4px] border-[#111111] bg-white shadow-[0_5px_15px_rgba(0,0,0,0.18)]">
                  {userData?.profilePhoto ? (
                    <img
                      src={userData.profilePhoto}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white text-[32px]">
                      👤
                    </div>
                  )}
                </div>

                <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#FFD600] bg-[#111111] text-[11px]">
                  ✏️
                </div>
              </button>
            </div>

            {/* USERNAME / KONAMI */}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 truncate text-[23px] font-black leading-tight text-[#111111]">
                  {userData?.username || "eFootball Player"}
                </h2>

                <button
                  type="button"
                  onClick={() => {
                    setUsernameInput(
                      userData?.username || ""
                    );

                    setUsernameError("");
                    setShowUsernameEditor(true);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#111111] text-[12px] text-[#FFD600]"
                  aria-label="Change username"
                >
                  ✏️
                </button>
              </div>
            </div>
          </div>

          {/* STATS TITLE */}

          <div className="relative z-10 mt-9 flex items-end justify-between">
            <div>
              <h3 className="text-[16px] font-black text-[#111111]">
                Player Stats
              </h3>

              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-black/45">
                Tournament Performance
              </p>
            </div>

            <div className="h-[5px] w-[72px] rounded-full bg-[#111111]" />
          </div>
        </section>

        {/* MY RANKING */}

        <section className="bg-[#eeeeee] px-3 pt-4">
          <div className="overflow-hidden rounded-[18px] border border-[#dedede] bg-white shadow-[0_4px_14px_rgba(0,0,0,0.05)]">

            <div className="flex items-center justify-between bg-[#111111] px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#FFD600]">
                  My Ranking
                </p>

                <p className="mt-1 text-[9px] font-bold text-white/50">
                  Overall Tournament Position
                </p>
              </div>

              <span className="text-[22px]">🏆</span>
            </div>

            <div className="flex items-center justify-between px-5 py-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-[#999999]">
                  Your Position
                </p>

                {rankingLoading ? (
                  <p className="mt-2 text-[13px] font-bold text-[#999999]">
                    Calculating...
                  </p>
                ) : playerRanking ? (
                  <p className="mt-1 text-[32px] font-black text-[#111111]">
                    #{playerRanking.rank}
                  </p>
                ) : (
                  <p className="mt-2 text-[12px] font-bold text-[#999999]">
                    No ranking yet
                  </p>
                )}
              </div>

              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#999999]">
                  Ranking Points
                </p>

                <p className="mt-1 text-[27px] font-black text-[#111111]">
                  {rankingLoading
                    ? "..."
                    : playerRanking?.points ?? 0}
                </p>

                <p className="text-[9px] font-bold text-[#999999]">
                  {playerRanking
                    ? `Out of ${playerRanking.totalPlayers} players`
                    : "Play tournaments to rank"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* STATS AREA */}

        <section className="bg-[#eeeeee] px-3 py-5">

          {/* CAREER STATISTICS */}

          <div className="overflow-hidden rounded-[20px] border border-[#d8d8d8] bg-white shadow-[0_5px_16px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between bg-[#111111] px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#FFD600]">
                  Career Statistics
                </p>

                <p className="mt-1 text-[11px] font-bold text-white/60">
                  eFootball Tournaments
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFD600] text-[17px]">
                📊
              </div>
            </div>

            <div className="px-4 py-7">

              {/* MATCH / WIN / LOSS */}

              <div className="grid grid-cols-3 text-center">
                <StatItem value={matches} label="Match" />

                <StatItem
                  value={wins}
                  label="Win"
                  highlight
                />

                <StatItem value={losses} label="Loss" />
              </div>

              <div className="my-7 h-[1px] bg-[#eeeeee]" />

              {/* TOURNAMENT / WINNER / RUNNER */}

              <div className="grid grid-cols-3 text-center">
                <StatItem
                  value={tournament.tournamentPlayed || 0}
                  label="Tournament"
                />

                <StatItem
                  value={tournament.tournamentWon || 0}
                  label="Winner"
                  highlight
                />

                <StatItem
                  value={tournament.tournamentRunner || 0}
                  label="Runner"
                />
              </div>

              <div className="my-7 h-[1px] bg-[#eeeeee]" />

              {/* GOALS / CONCEDED / DIFFERENCE */}

              <div className="grid grid-cols-3 text-center">
                <StatItem value={goals} label="Goals" />

                <StatItem
                  value={conceded}
                  label="Conceded"
                />

                <StatItem
                  value={
                    goalDifference >= 0
                      ? `+${goalDifference}`
                      : goalDifference
                  }
                  label="Goal Difference"
                  highlight
                />
              </div>
            </div>
          </div>

          {/* SMALL SUMMARY */}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-[#FFD600] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-black/55">
                Total Wins
              </p>

              <p className="mt-2 text-[25px] font-black leading-none text-[#111111]">
                {wins}
              </p>
            </div>

            <div className="rounded-[16px] bg-[#111111] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#FFD600]/70">
                Championships
              </p>

              <p className="mt-2 text-[25px] font-black leading-none text-[#FFD600]">
                {tournament.tournamentWon || 0}
              </p>
            </div>
          </div>
        </section>

        {/* LOGOUT */}

        <section className="bg-[#eeeeee] px-4 pb-7 pt-1">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#111111] text-[11px] font-black tracking-[0.08em] text-[#FFD600] shadow-[0_4px_12px_rgba(0,0,0,0.12)] transition hover:bg-[#222222] active:scale-[0.98] disabled:opacity-60"
          >
            <span>↪</span>

            {loggingOut ? "LOGGING OUT..." : "LOGOUT"}
          </button>
        </section>
      </div>

      {/* FIXED BOTTOM NAV */}

      <BottomNavigation />

      {/* CHANGE USERNAME MODAL */}

      {showUsernameEditor && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px]">

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[22px] font-black text-[#111111]">
                  Change Username
                </h2>

                <p className="mt-1 text-[11px] font-medium text-[#888888]">
                  Choose your new player name
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowUsernameEditor(false)
                }
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eeeeee] text-[18px] font-black text-[#111111]"
              >
                ×
              </button>
            </div>

            <div className="mt-5">
              <label className="text-[10px] font-black uppercase tracking-wider text-[#777777]">
                Player Username
              </label>

              <input
                type="text"
                value={usernameInput}
                onChange={(e) => {
                  setUsernameInput(e.target.value);
                  setUsernameError("");
                }}
                maxLength={20}
                placeholder="Enter new username"
                className="mt-2 h-12 w-full rounded-xl border border-[#dddddd] bg-[#f8f8f8] px-4 text-[13px] font-bold text-[#111111] outline-none focus:border-[#FFD600]"
              />

              <p className="mt-2 text-right text-[9px] font-bold text-[#999999]">
                {usernameInput.length}/20
              </p>
            </div>

            {usernameError && (
              <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[11px] font-bold text-red-600">
                {usernameError}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={savingUsername}
                onClick={() =>
                  setShowUsernameEditor(false)
                }
                className="h-12 rounded-xl border border-[#dddddd] text-[11px] font-black text-[#777777]"
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={
                  savingUsername ||
                  !usernameInput.trim()
                }
                onClick={handleSaveUsername}
                className="h-12 rounded-xl bg-[#111111] text-[11px] font-black text-[#FFD600] disabled:opacity-50"
              >
                {savingUsername
                  ? "SAVING..."
                  : "SAVE USERNAME"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE AVATAR MODAL */}

      {showAvatarPicker && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:px-4">
          <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px]">

            {/* HEADER */}

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[22px] font-black text-[#111111]">
                  Choose Your Player
                </h2>

                <p className="mt-1 text-[11px] font-medium text-[#888888]">
                  Select your new profile avatar
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowAvatarPicker(false)
                }
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eeeeee] text-[18px] font-black text-[#111111]"
              >
                ×
              </button>
            </div>

            {/* AVATARS */}

            <div className="mt-5 grid grid-cols-3 gap-3">
              {PLAYER_AVATARS.map((avatar) => {
                const selected =
                  selectedAvatar === avatar.image;

                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => {
                      setSelectedAvatar(avatar.image);
                      setAvatarError("");
                    }}
                    className={`relative overflow-hidden rounded-[17px] border-[3px] bg-[#eeeeee] transition active:scale-[0.97] ${
                      selected
                        ? "border-[#FFD600]"
                        : "border-transparent"
                    }`}
                  >
                    <div className="aspect-square overflow-hidden">
                      <img
                        src={avatar.image}
                        alt={avatar.name}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div
                      className={`px-1 py-2 text-[9px] font-black ${
                        selected
                          ? "bg-[#FFD600] text-[#111111]"
                          : "bg-[#111111] text-white"
                      }`}
                    >
                      {avatar.name}
                    </div>

                    {selected && (
                      <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFD600] text-[12px] font-black text-black shadow">
                        ✓
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ERROR */}

            {avatarError && (
              <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[11px] font-bold text-red-600">
                {avatarError}
              </div>
            )}

            {/* BUTTONS */}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={savingAvatar}
                onClick={() =>
                  setShowAvatarPicker(false)
                }
                className="h-12 rounded-xl border border-[#dddddd] bg-white text-[11px] font-black text-[#777777]"
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={
                  savingAvatar || !selectedAvatar
                }
                onClick={handleSaveAvatar}
                className="h-12 rounded-xl bg-[#111111] text-[11px] font-black text-[#FFD600] transition active:scale-[0.98] disabled:opacity-50"
              >
                {savingAvatar
                  ? "SAVING..."
                  : "SAVE AVATAR"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* =================================================
   STAT ITEM
================================================= */

function StatItem({
  value,
  label,
  highlight = false,
}: {
  value: number | string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 px-1">
      {highlight ? (
        <div className="mx-auto flex min-h-[44px] min-w-[44px] max-w-fit items-center justify-center rounded-[12px] bg-[#FFD600] px-3 text-[21px] font-black leading-none text-[#111111]">
          {value}
        </div>
      ) : (
        <div className="flex min-h-[44px] items-center justify-center text-[22px] font-black leading-none text-[#111111]">
          {value}
        </div>
      )}

      <div className="mt-2 whitespace-nowrap text-[9px] font-bold text-[#999999]">
        {label}
      </div>
    </div>
  );
}

/* =================================================
   BOTTOM NAVIGATION
================================================= */

function BottomNavigation() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#222222] bg-[#111111]">
      <div className="mx-auto grid h-[72px] max-w-md grid-cols-5">

        <BottomNavItem
          icon="🏆"
          label="Tournaments"
          onClick={() => router.push("/")}
        />

        <BottomNavItem
          icon="🎮"
          label={
            <>
              My
              <br />
              Tournaments
            </>
          }
          onClick={() => router.push("/my-tournaments")}
        />

        <BottomNavItem
          icon="⚡"
          label={
            <>
              Division
              <br />
              League
            </>
          }
          onClick={() => router.push("/division")}
        />

        <BottomNavItem
          icon="🏅"
          label={
            <>
              Leader
              <br />
              Board
            </>
          }
          onClick={() => router.push("/leaderboard")}
        />

        <BottomNavItem
          icon="👤"
          label="Profile"
          active
          onClick={() => router.push("/profile")}
        />
      </div>
    </nav>
  );
}

/* =================================================
   BOTTOM NAV ITEM
================================================= */

function BottomNavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: string;
  label: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full flex-col items-center justify-center gap-[3px] transition ${
        active
          ? "text-[#FFD600]"
          : "text-[#777777]"
      }`}
    >
      <span
        className={`flex h-[23px] items-center justify-center text-[19px] leading-none transition ${
          active ? "" : "grayscale opacity-35"
        }`}
      >
        {icon}
      </span>

      <span
        className={`text-[8px] leading-[10px] ${
          active
            ? "font-black text-[#FFD600]"
            : "font-bold text-[#777777] opacity-70"
        }`}
      >
        {label}
      </span>
    </button>
  );
}