import { Component, ErrorInfo, ReactNode } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";

const Fallback = () => {
  const { t } = useApp();
  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="max-w-sm text-center space-y-3" role="alert">
        <h1 className="text-xl font-bold text-primary">{t("err_boundary_title")}</h1>
        <p className="text-sm text-muted-foreground">{t("err_boundary_msg")}</p>
        <Button onClick={() => window.location.reload()}>{t("err_boundary_reload")}</Button>
      </div>
    </div>
  );
};

/** Catches render errors and failed lazy chunks so users never see a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

export default ErrorBoundary;
