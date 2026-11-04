import { createFileRoute } from "@tanstack/react-router";
import { OrreryApp } from "@/ui/OrreryApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <OrreryApp />;
}
