import type { Metadata } from "next";
import { DemoStart } from "./DemoStart";

export const metadata: Metadata = {
  title: "Demo",
  description: "See Limbo in action in a room with simulated travellers.",
};

export default function DemoPage() {
  return <DemoStart />;
}
