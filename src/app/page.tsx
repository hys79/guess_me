import Link from "next/link";
import { GAMES, HUB_NAME, HUB_TAGLINE, SOLO_GAMES } from "@/games/registry";

/** 홈의 게임 카드 한 줄 — 제목과 버튼만 (부연설명 없음) */
function GameCard({
  href,
  icon,
  name,
  action,
}: {
  href: string;
  icon: string;
  name: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="card flex items-center gap-3 !p-4 transition-transform active:scale-[0.99] hover:border-primary-200"
    >
      <span className="text-3xl" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-lg font-bold text-slate-900">
        {name}
      </span>
      <span className="shrink-0 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700">
        {action}
      </span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 px-6 py-12">
      <header className="animate-fade-in-up text-center">
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-primary-700 sm:text-6xl">
          {HUB_NAME}
        </h1>
        <p className="mt-4 text-base text-slate-500 sm:text-lg">{HUB_TAGLINE}</p>
      </header>

      <div
        className="w-full animate-fade-in-up"
        style={{ animationDelay: "60ms" }}
      >
        <Link href="/join" className="btn-secondary w-full py-3.5 text-base">
          방 코드로 참가하기
        </Link>
      </div>

      <section
        className="flex w-full animate-fade-in-up flex-col gap-2.5"
        style={{ animationDelay: "110ms" }}
        aria-label="함께 하기"
      >
        <h2 className="text-sm font-bold text-slate-500">함께 하기</h2>
        {GAMES.map((game) => (
          <GameCard
            key={game.id}
            href={`/create?game=${game.id}`}
            icon={game.icon}
            name={game.name}
            action="방 만들기"
          />
        ))}
      </section>

      <section
        className="flex w-full animate-fade-in-up flex-col gap-2.5"
        style={{ animationDelay: "160ms" }}
        aria-label="혼자 하기"
      >
        <h2 className="text-sm font-bold text-slate-500">혼자 하기</h2>
        {SOLO_GAMES.map((game) => (
          <GameCard
            key={game.id}
            href={game.href}
            icon={game.icon}
            name={game.name}
            action="바로 시작"
          />
        ))}
      </section>
    </main>
  );
}
