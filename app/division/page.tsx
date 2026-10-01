"use client";

import { useRouter } from "next/navigation";

export default function DivisionPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#eeeeee] pb-[88px] text-[#111111]">
      {/* HEADER */}
      <header className="bg-[#FFD600] px-6 py-7">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/50">
          eFootball
        </p>

        <h1 className="mt-1 text-[30px] font-extrabold text-[#111111]">
          Division League
        </h1>
      </header>

      {/* COMING SOON */}
      <section className="flex min-h-[calc(100vh-180px)] items-center justify-center px-6">
        <div className="w-full max-w-md rounded-[24px] border border-[#d8d8d8] bg-white px-6 py-12 text-center shadow-[0_5px_18px_rgba(0,0,0,0.06)]">

          {/* ICON */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#FFD600] text-4xl">
            🏆
          </div>

          <h2 className="mt-6 text-[28px] font-extrabold text-[#111111]">
            Coming Soon
          </h2>

          <p className="mt-3 text-[16px] leading-6 text-[#888888]">
            Division League is currently under development.
            Stay tuned for the upcoming league system.
          </p>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-8 h-12 w-full rounded-xl bg-[#111111] text-sm font-black text-[#FFD600] transition active:scale-[0.98]"
          >
            Back to Tournaments
          </button>
        </div>
      </section>

      {/* BOTTOM NAVIGATION */}
      <BottomNavigation />
    </main>
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
  label: React.ReactNode;
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
      {/* ICON */}
      <span
        className={`flex h-[23px] items-center justify-center text-[19px] leading-none transition ${
          active
            ? ""
            : "grayscale opacity-35"
        }`}
      >
        {icon}
      </span>

      {/* LABEL */}
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

/* =================================================
   BOTTOM NAVIGATION
================================================= */

function BottomNavigation() {
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#222222] bg-[#111111]">
      <div className="mx-auto grid h-[72px] max-w-md grid-cols-5">

        {/* TOURNAMENTS */}
        <BottomNavItem
          icon="🏆"
          label="Tournaments"
          onClick={() => router.push("/")}
        />

        {/* MY TOURNAMENTS */}
        <BottomNavItem
          icon="🎮"
          label={
            <>
              My
              <br />
              Tournaments
            </>
          }
          onClick={() =>
            router.push("/my-tournaments")
          }
        />

        {/* DIVISION LEAGUE */}
        <BottomNavItem
          icon="⚡"
          active
          label={
            <>
              Division
              <br />
              League
            </>
          }
          onClick={() =>
            router.push("/division")
          }
        />

        {/* LEADERBOARD */}
        <BottomNavItem
          icon="🏅"
          label={
            <>
              Leader
              <br />
              Board
            </>
          }
          onClick={() =>
            router.push("/leaderboard")
          }
        />

        {/* PROFILE */}
        <BottomNavItem
          icon="👤"
          label="Profile"
          onClick={() =>
            router.push("/profile")
          }
        />
      </div>
    </nav>
  );
}