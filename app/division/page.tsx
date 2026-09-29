"use client";

import { useRouter } from "next/navigation";

export default function DivisionPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#e9e9e9] pb-[88px] text-black">
      {/* Header */}
      <header className="bg-[#111111] px-6 py-7 text-white">
        <h1 className="text-[30px] font-extrabold">
          Division League
        </h1>
      </header>

      {/* Coming Soon */}
      <section className="flex min-h-[calc(100vh-180px)] items-center justify-center px-6">
        <div className="w-full max-w-md rounded-[24px] border border-[#c8c8c8] bg-white px-6 py-12 text-center shadow-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e8f5e7] text-4xl">
            🏆
          </div>
          <h2 className="mt-6 text-[28px] font-extrabold">
            Coming Soon
          </h2>
          <p className="mt-3 text-[16px] leading-6 text-[#888888]">
            Division League is currently under development.
            Stay tuned for the upcoming league system.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-8 h-12 w-full rounded-xl bg-[#111111] text-sm font-bold text-white transition active:scale-[0.98]"
          >
            Back to Tournaments
          </button>
        </div>
      </section>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </main>
  );
}

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
      className={`flex h-full flex-col items-center justify-center gap-[3px] ${
        active
          ? "text-[#111111]"
          : "text-[#a6a6a6]"
      }`}
    >
      <span className="flex h-[23px] items-center justify-center text-[19px] leading-none">
        {icon}
      </span>
      <span
        className={`text-[8px] leading-[10px] ${
          active
            ? "font-black text-[#111111]"
            : "font-bold text-[#a6a6a6]"
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e5e7eb] bg-white">
      <div className="mx-auto grid h-[72px] max-w-md grid-cols-5">
        <BottomNavItem
          icon="🏆"
          label="Tournaments"
          onClick={() =>
            router.push("/")
          }
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
          onClick={() =>
            router.push(
              "/my-tournaments"
            )
          }
        />
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
            router.push(
              "/division"
            )
          }
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
          onClick={() =>
            router.push(
              "/leaderboard"
            )
          }
        />
        <BottomNavItem
          icon="👤"
          label="Profile"
          onClick={() =>
            router.push(
              "/profile"
            )
          }
        />
      </div>
    </nav>
  );
}
