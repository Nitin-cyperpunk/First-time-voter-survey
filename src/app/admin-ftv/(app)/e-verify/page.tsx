import { redirect } from "next/navigation";

export default function EVerifyRedirectPage() {
  redirect("/respondents?verification=pending");
}
