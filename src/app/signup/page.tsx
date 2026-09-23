import { redirect } from "next/navigation";

/**
 * Accounts are implicit (customer-auth contract §4): the first verified
 * one-time code creates one and links every inquiry made with that number.
 * There is nothing to fill in, so /signup is just the door to /login.
 */
export default function SignupPage() {
  redirect("/login");
}
