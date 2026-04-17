export type StepProps = {
  readonly onDone: () => void;
  readonly onBack: () => void;
};

export function Wallet(_: StepProps) {
  return <text>Wallet placeholder</text>;
}
