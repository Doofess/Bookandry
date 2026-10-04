/**
 * An interest rate: "4.75%".
 *
 * The digits and the sign as one left-to-right island, so a Hebrew sentence
 * does not turn it into "%4.75". Rendered from the decimal string as stored -
 * never through a float - so 4.35 is never 4.3500000000000005.
 */
export function Percent({ rate, className }: { readonly rate: string; readonly className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {rate}%
    </bdi>
  );
}
