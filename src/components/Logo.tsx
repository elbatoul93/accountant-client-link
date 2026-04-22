import logo from "@/assets/logo.png";

export const Logo = ({ size = 40, withText = true }: { size?: number; withText?: boolean }) => (
  <div className="flex items-center gap-2.5">
    <img src={logo} alt="Managementik" width={size} height={size} className="rounded-full object-contain" />
    {withText && (
      <div className="flex flex-col leading-none">
        <span className="font-bold text-base sm:text-lg text-primary tracking-tight">Managementik</span>
        <span className="text-[10px] text-gold-deep font-medium hidden sm:block">Digital Accounting</span>
      </div>
    )}
  </div>
);
