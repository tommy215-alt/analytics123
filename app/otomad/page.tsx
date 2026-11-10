import type { Metadata } from "next";
import { Studio } from "@/components/otomad/Studio";

export const metadata: Metadata = { title: "音MADメーカー" };

export default function OtomadPage() {
  return <Studio />;
}
