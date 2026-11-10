import { Component, type ReactNode } from "react";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";

/** Shows a view that failed while drawing, in the failure's own words, so the other areas keep running. */
export class StudioViewFailureBoundary extends Component<{ viewTitle: string; children: ReactNode }, { failureWords: string | null }> {
  override state: { failureWords: string | null } = { failureWords: null };

  static getDerivedStateFromError(failure: unknown): { failureWords: string } {
    return { failureWords: failure instanceof Error ? failure.message : String(failure) };
  }

  override render(): ReactNode {
    if (this.state.failureWords === null) return this.props.children;
    return <WaitingState isFailure title={`${this.props.viewTitle} stopped drawing`} explanation={this.state.failureWords} />;
  }
}
