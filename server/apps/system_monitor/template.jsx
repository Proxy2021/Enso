export default function GeneratedUI({ data, onAction }) {
  const [procSort, setProcSort] = useState("cpu");
  const [procLimit, setProcLimit] = useState("15");

  const isProcesses = data?.tool === "enso_system_monitor_processes";
  const isDisk = data?.tool === "enso_system_monitor_disk_usage";

  if (data?.error) {
    return (
      <UICard accent="rose" header="System Monitor">
        <Alert variant="danger" title="Error">{data.error}</Alert>
        <Button variant="primary" className="mt-2" onClick={() => onAction("overview", {})}>
          Retry
        </Button>
      </UICard>
    );
  }

  if (isProcesses) {
    const processes = data?.processes ?? [];
    return (
      <UICard accent="cyan" header={
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold flex items-center gap-2">
            <LucideReact.Activity size={16} /> Processes
          </span>
          <Badge variant="info">{data?.count ?? processes.length} shown (by {data?.sortBy})</Badge>
        </div>
      }>
        {processes.length === 0 ? (
          <EmptyState icon={<LucideReact.Activity size={28} />} title="No processes found" />
        ) : (
          <DataTable
            columns={[
              { key: "pid", label: "PID", sortable: true },
              { key: "name", label: "Name", sortable: true },
              { key: "cpu", label: "CPU", sortable: true },
              { key: "memory", label: "Memory", sortable: true },
            ]}
            data={processes}
            pageSize={15}
            striped
            compact
          />
        )}
        <div className="flex gap-2 mt-3">
          <Button variant="ghost" onClick={() => onAction("overview", {})}>
            <LucideReact.ArrowLeft size={14} /> Overview
          </Button>
          <Button variant="default" onClick={() => onAction("processes", { sort_by: procSort, limit: Number(procLimit) })}>
            <LucideReact.RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </UICard>
    );
  }

  if (isDisk) {
    const disks = data?.disks ?? [];
    return (
      <UICard accent="amber" header={
        <span className="font-semibold flex items-center gap-2">
          <LucideReact.HardDrive size={16} /> Disk Usage
        </span>
      }>
        {disks.length === 0 ? (
          <EmptyState icon={<LucideReact.HardDrive size={28} />} title="No disks found" />
        ) : (
          <div className="space-y-3">
            {disks.map((disk, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-gray-800/60 border border-gray-700/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-200 flex items-center gap-1.5">
                    <LucideReact.HardDrive size={13} className="text-amber-400" />
                    {disk.mount}
                  </span>
                  <Badge variant={disk.usagePercent > 90 ? "danger" : disk.usagePercent > 75 ? "warning" : "success"}>
                    {disk.usagePercent}%
                  </Badge>
                </div>
                <Progress value={disk.usagePercent} max={100} variant={disk.usagePercent > 90 ? "danger" : disk.usagePercent > 75 ? "warning" : "success"} size="sm" />
                <div className="flex gap-3 mt-1.5 text-[10px] text-gray-500">
                  <span>Total: {disk.total}</span>
                  <span>Used: {disk.used}</span>
                  <span>Free: {disk.free}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <Button variant="ghost" onClick={() => onAction("overview", {})}>
            <LucideReact.ArrowLeft size={14} /> Overview
          </Button>
          <Button variant="default" onClick={() => onAction("disk_usage", {})}>
            <LucideReact.RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </UICard>
    );
  }

  const mem = data?.memory ?? {};
  const cpuUsage = data?.cpuUsage ?? 0;
  const memUsage = mem.usagePercent ?? 0;

  return (
    <div className="space-y-4">
      <UICard accent="violet" header={
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold flex items-center gap-2">
            <LucideReact.Monitor size={16} /> System Monitor
          </span>
          <Badge variant="default">{data?.hostname ?? "—"}</Badge>
        </div>
      }>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Stat label="CPU Usage" value={`${cpuUsage}%`} accent={cpuUsage > 80 ? "rose" : cpuUsage > 50 ? "amber" : "emerald"} />
          <Stat label="Memory" value={`${memUsage}%`} accent={memUsage > 80 ? "rose" : memUsage > 50 ? "amber" : "emerald"} />
          <Stat label="Uptime" value={data?.uptime ?? "—"} accent="blue" />
          <Stat label="CPU Cores" value={data?.cpuCores ?? "—"} accent="cyan" />
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">System</p>
            <div className="space-y-1 text-xs text-gray-300">
              <div className="flex justify-between"><span className="text-gray-500">Platform</span><span>{data?.platform ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Architecture</span><span>{data?.arch ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Node.js</span><span>{data?.nodeVersion ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">PID</span><span>{data?.pid ?? "—"}</span></div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Memory</p>
            <Progress value={memUsage} max={100} variant={memUsage > 80 ? "danger" : "success"} showLabel size="lg" />
            <div className="space-y-1 text-xs text-gray-300">
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span>{mem.total ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Used</span><span>{mem.used ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Free</span><span>{mem.free ?? "—"}</span></div>
            </div>
          </div>
        </div>

        <Separator className="mt-3" />

        <div className="flex gap-2 mt-3 flex-wrap">
          <Button variant="primary" onClick={() => onAction("overview", {})}>
            <LucideReact.RefreshCw size={14} /> Refresh
          </Button>
          <Button variant="default" onClick={() => onAction("processes", { sort_by: procSort, limit: Number(procLimit) })}>
            <LucideReact.Activity size={14} /> Processes
          </Button>
          <Button variant="default" onClick={() => onAction("disk_usage", {})}>
            <LucideReact.HardDrive size={14} /> Disk Usage
          </Button>
          <div className="flex gap-1 items-center ml-auto">
            <Select options={[{ value: "cpu", label: "By CPU" }, { value: "memory", label: "By Memory" }]} value={procSort} onChange={setProcSort} />
          </div>
        </div>
      </UICard>
    </div>
  );
}
