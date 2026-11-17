import type { Metadata } from "next";
import FiveLinkGame from "@/games/five-link/FiveLinkGame";

export const metadata: Metadata = {
  title: "Five Link",
  description: "합이 5의 배수가 되게 타일을 이어 보세요",
};

export default function FiveLinkPage() {
  return <FiveLinkGame />;
}
