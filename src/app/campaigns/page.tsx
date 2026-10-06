import { redirect } from "next/navigation";

/**
 * There is no listing of campaigns. A result is reached by the link the donor was given and by
 * nothing else, so this path, which used to hold a reviewer's queue, sends the reader to the
 * paste form.
 */
export default function CampaignsPage(): never {
  redirect("/");
}
