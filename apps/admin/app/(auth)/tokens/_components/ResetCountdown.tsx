import { humanizeResetSeconds } from "../_lib/view-model";

type Props = { seconds: number | null };

/**
 * Humanized seconds-until-reset countdown. Server-rendered with the value
 * delivered at request time — the page is `force-dynamic`, so every paint
 * starts from a fresh poll. No client timer tick to avoid hydration flicker
 * at the second boundary.
 */
export function ResetCountdown({ seconds }: Props) {
  return (
    <span className="text-xs tabular-nums">
      {humanizeResetSeconds(seconds)}
    </span>
  );
}
