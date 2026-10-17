import { redirect } from "next/navigation";

export default function DedicatedCashierPage() {
  redirect("/offline-store?tab=pos&mode=focus");
}
