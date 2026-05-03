export function LoadingSkeleton(){return <div className="space-y-3">{Array.from({length:3}).map((_,i)=><div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200"/>)}</div>}
