import { z } from "zod";

/**
 * The schema issues underneath a failed model response, written out so they can be read.
 *
 * The SDK reports a rejected response as a `NoObjectGeneratedError` whose message says only that
 * no object was generated, and buries the zod error two causes down. A failure that reaches a log
 * or a live run therefore names nothing: an operator sees that the mapping failed and cannot see
 * which field failed it, which is how the two thrown fixtures on the eval gate stayed a guess
 * about rationale quotation rather than a fact. The issues are lifted out here and carried in the
 * thrown error's own message, and the same text is what the re-ask hands back to the model.
 *
 * A path is joined with dots so it reads as the field it is, and an issue with no path is
 * reported against the object itself. The cause chain is walked rather than reached into at a
 * fixed depth, because the depth is the SDK's business and it is free to change.
 */
export function describeValidationIssues(cause: unknown): string | null {
  let current = cause;

  for (let depth = 0; current !== null && current !== undefined && depth < 8; depth += 1) {
    if (current instanceof z.ZodError) {
      return current.issues
        .map((issue) => {
          const path = issue.path.join(".");
          return path === "" ? issue.message : `${path}: ${issue.message}`;
        })
        .join("; ");
    }

    current = current instanceof Error ? current.cause : null;
  }

  return null;
}
