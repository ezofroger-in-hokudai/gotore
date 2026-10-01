import { DemoApp } from "@/features/demo/demo-app";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "E-GOTORE デモ",
  robots: { index: false, follow: false },
};
export default function DemoPage() {
  return <DemoApp />;
}
