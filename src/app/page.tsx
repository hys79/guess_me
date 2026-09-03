import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-12 px-6 py-12">
      <header className="animate-fade-in-up text-center">
        <h1 className="text-6xl font-extrabold leading-tight tracking-tight text-primary-700 sm:text-7xl">
          Guess Me!
        </h1>
        <p className="mt-4 text-base text-slate-500 sm:text-lg">
          나를 가장 잘 아는 사람은 누구?
        </p>
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
