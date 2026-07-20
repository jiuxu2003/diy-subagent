import { Component, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary
  extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <main className="grid min-h-screen place-items-center bg-[var(--background)] p-8">
          <section className="max-w-lg rounded-3xl border border-[var(--danger-border)] bg-[var(--surface-raised)] p-8 shadow-xl">
            <p className="text-sm font-semibold text-[var(--danger)]">
              界面发生异常
            </p>
            <h1 className="mt-2 text-2xl font-bold text-[var(--text)]">
              当前页面无法继续渲染
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              为避免泄露本机配置内容，异常详情不会显示或写入前端日志。请重新加载应用后重试。
            </p>
            <Button className="mt-6" onClick={() => { window.location.reload(); }}>
              重新加载应用
            </Button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
