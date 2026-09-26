export default function PageHeader({
  title,
  subtitle,
  actions,
  display = false,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  display?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        {display ? (
          <h1 className="display text-navy text-[32px] sm:text-[38px] leading-none">{title}</h1>
        ) : (
          <h1 className="text-navy text-[24px] sm:text-[28px] font-extrabold leading-tight">{title}</h1>
        )}
        {subtitle && <p className="text-ink-2 mt-1.5 text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
