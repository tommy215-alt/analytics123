import type { Metadata } from "next";
import { AvatarDemo } from "@/components/avatar/AvatarDemo";

export const metadata: Metadata = { title: "紬 | アバター試作" };

export default function AvatarPage() {
  return <AvatarDemo />;
}
