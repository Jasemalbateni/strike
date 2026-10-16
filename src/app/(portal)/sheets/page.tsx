import { redirect } from "next/navigation";

/** the library at /drills is the single home for sheets and drawings */
export default function SheetsIndex() {
  redirect("/drills");
}
