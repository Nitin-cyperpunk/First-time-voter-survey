export default function RespondentsLoading() {
  return (
    <div className="space-y-6">
      <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
        <div className="h-5 w-32 animate-pulse rounded bg-rose-soft" />
        <div className="mt-2 h-4 w-full max-w-lg animate-pulse rounded bg-rose-tint" />
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="h-9 flex-1 animate-pulse rounded-md bg-rose-tint" />
          <div className="h-9 w-full animate-pulse rounded-md bg-rose-tint lg:w-48" />
          <div className="h-9 w-full animate-pulse rounded-md bg-rose-tint lg:w-48" />
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-card shadow-sm">
        <div className="space-y-3 p-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 animate-pulse rounded bg-rose-tint"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
