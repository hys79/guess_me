import Link from "next/link";
import { GAMES, HUB_NAME, HUB_TAGLINE } from "@/games/registry";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-10 px-6 py-12">
      <header className="animate-fade-in-up text-center">
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-primary-700 sm:text-6xl">
          {HUB_NAME}
        </h1>
        <p className="mt-4 text-base text-slate-500 sm:text-lg">{HUB_TAGLINE}</p>
      </header>

      <section
        className="flex w-full animate-fade-in-up flex-col gap-3"
        style={{ animationDelay: "80ms" }}
        aria-label="게임 목록"
      >
        {GAMES.map((game) => (
          <Link
            key={game.id}
            href={`/create?game=${game.id}`}
            className="card flex items-center gap-4 transition-transform active:scale-[0.99] hover:border-primary-200"
          >
            <span className="text-4xl" aria-hidden>
              {game.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-slate-900">
                {game.name}
              </span>
              <span className="block text-sm text-slate-500">{game.tagline}</span>
              <span className="mt-1 block text-xs text-slate-400">{game.players}</span>
            </span>
            <span className="shrink-0 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700">
              방 만들기
            </span>
          </Link>
        ))}
      </section>

      <div
        className="w-full animate-fade-in-up"
        style={{ animationDelay: "140ms" }}
      >
        <Link href="/join" className="btn-secondary w-full py-3.5 text-base">
          방 코드로 참가하기
        </Link>
      </div>
    </main>
  );
}
