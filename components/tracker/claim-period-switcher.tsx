export function ClaimPeriodSwitcher({label,onPrev,onNext,onCurrent}:{label:string,onPrev:()=>void,onNext:()=>void,onCurrent:()=>void}){
  return <div className="flex items-center gap-2"><button onClick={onPrev} className="rounded-lg border px-3 py-2">Previous claim period</button><button onClick={onCurrent} className="rounded-lg border px-3 py-2">Current claim period</button><button onClick={onNext} className="rounded-lg border px-3 py-2">Next claim period</button><span className="text-sm text-slate-500">{label}</span></div>
}
