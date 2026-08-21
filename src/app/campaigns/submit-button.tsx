"use client";

import { useFormStatus } from "react-dom";

/**
 * The submit control for a form whose action is a model call.
 *
 * A triage run is two sequential model calls against the campaign text and takes tens of
 * seconds. A plain submit button stays enabled and unchanged for all of it, so the page reads
 * as inert and the reviewer cannot tell the difference between work in flight and a click that
 * never landed. This says the work started, and it refuses the second click that would file a
 * second agent file against the same campaign while the first is still running.
 *
 * The resting label is the caller's, unchanged: the pending label is a transient state and
 * never a rewording of what the tests and the runbook anchor on.
 */
export function SubmitButton({
  className = "btn",
  pendingLabel,
  children,
}: {
  className?: string;
  pendingLabel: string;
  children: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="btn__spinner" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
