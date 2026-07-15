export function StatCard({ label, value, icon: Icon, sub, gradient = "from-blue-500 to-blue-600", lightBg = "bg-blue-50", text = "text-blue-600", border = "border-blue-100" }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white border ${border} p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${lightBg} flex items-center justify-center`}>
          {Icon && <Icon size={20} className={text} />}
        </div>
        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${gradient} opacity-10 absolute top-2 right-2`} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <span className={`text-2xl font-bold ${text} leading-tight`}>{value}</span>
        {sub && <span className="text-[11px] text-gray-400 mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

export default StatCard;
