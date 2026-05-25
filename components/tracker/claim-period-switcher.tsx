export function ClaimPeriodSwitcher({
  label,
  onPrev,
  onNext,
  onCurrent,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  onCurrent: () => void
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
        <button type="button" onClick={onPrev} className="rounded-lg border px-3 py-2 text-left sm:text-center">
          Previous claim period
        </button>
        <button type="button" onClick={onCurrent} className="rounded-lg border px-3 py-2 text-left sm:text-center">
          Current claim period
        </button>
        <button type="button" onClick={onNext} className="rounded-lg border px-3 py-2 text-left sm:text-center">
          Next claim period
        </button>
      </div>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  )
}
