import type { Metadata } from "next";
import LinkTenGame from "@/games/link-ten/LinkTenGame";

export const metadata: Metadata = {
  title: "Link Ten",
  description: "합이 5의 배수가 되게 타일을 이어 보세요",
};

export default function LinkTenPage() {
  return <LinkTenGame />;
}
