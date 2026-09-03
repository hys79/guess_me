import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-10 px-6 py-12">
      <header className="animate-fade-in-up text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-primary-700">
          guess me
        </h1>
        <p className="mt-3 text-sm text-slate-500">닉네임 기반 실시간 추측 게임</p>
      </header>

      <div
        className="flex w-full animate-fade-in-up flex-col gap-3"
        style={{ animationDelay: "80ms" }}
      >
        <Link href="/create" className="btn-primary w-full py-3.5 text-base">
          방 만들기
        </Link>
        <Link href="/join" className="btn-secondary w-full py-3.5 text-base">
          참가하기
        </Link>
      </div>
    </main>
  );
}
