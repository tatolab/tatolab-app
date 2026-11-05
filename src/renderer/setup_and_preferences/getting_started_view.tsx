import { useEffect, useRef, useState } from "react";
import { describeBackendRejection } from "../backend/tatolab_backend";
import { ActionButton } from "../design_system/action_button";
import { PendingActionWords } from "../design_system/pending_action_words";
import { ProgressChecklist, ProgressChecklistStep } from "../design_system/progress_checklist";
import { RefusalLine } from "../design_system/refusal_line";
import { presentGettingStarted, type GettingStartedStepPresentation } from "../presentation/getting_started_presentation";
import { windowDragRegionAttribute } from "../presentation/platform_presentation";
import { RUNTIME_BANNER_ACTION_LABELS, RUNTIME_BANNER_ACTION_REFUSAL_LEADS, type RuntimeBannerAction } from "../presentation/runtime_presentation";
import { runBannerAction, useActionThroughTheBackend } from "./action_through_the_backend";
import { useTatolabStatus, useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The action that moves a step on, waiting for the backend's answer in its place, and its refusal under the step. */
function GettingStartedStepWithAction({ step, action }: { step: GettingStartedStepPresentation; action: RuntimeBannerAction }) {
  const { backend } = useTatolabWindowEnvironment();
  const stepAction = useActionThroughTheBackend(() => runBannerAction(backend, action), RUNTIME_BANNER_ACTION_REFUSAL_LEADS[action]);
  return (
    <ProgressChecklistStep
      progress={step.progress}
      title={step.title}
      progressWords={step.progressWords}
      explanation={step.explanation}
      data-getting-started-step={step.step}
      action={
        stepAction.isPending ? (
          <PendingActionWords words="Asking…" />
        ) : (
          <ActionButton
            appearance={step.progress === "needs_you" ? "primary" : "secondary"}
            onPressed={stepAction.run}
            data-getting-started-step-action={action}
          >
            {RUNTIME_BANNER_ACTION_LABELS[action]}
          </ActionButton>
        )
      }
    >
      {stepAction.refusal !== null && <RefusalLine lead={stepAction.refusal.lead} words={stepAction.refusal.words} />}
    </ProgressChecklistStep>
  );
}

/** One step of the checklist, with the action that moves it on when it has one. */
function GettingStartedStep({ step }: { step: GettingStartedStepPresentation }) {
  if (step.action !== null) return <GettingStartedStepWithAction step={step} action={step.action} />;
  return (
    <ProgressChecklistStep
      progress={step.progress}
      title={step.title}
      progressWords={step.progressWords}
      explanation={step.explanation}
      data-getting-started-step={step.step}
    />
  );
}

/** Getting set up, taking keyboard focus at its heading as it opens. */
function GettingSetUpScreen({ steps }: { steps: readonly GettingStartedStepPresentation[] }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div data-getting-started-screen="getting_set_up">
      <h1 ref={headingRef} tabIndex={-1} className="title-lg focus-visible:shadow-none">
        Getting set up
      </h1>
      <p className="mt-1 mb-5 text-fg-2">The runtime starts in the background. Tato Studio asks you for something only when macOS needs you.</p>
      <ProgressChecklist label="Getting set up">
        {steps.map((step) => (
          // A step whose standing changes starts afresh, so a refusal never outlives the state it was refused in.
          <GettingStartedStep key={`${step.step}:${step.progress}:${step.action ?? "none"}`} step={step} />
        ))}
      </ProgressChecklist>
    </div>
  );
}

/** First run on macOS, filling the window until Get Started: Getting set up, whose checklist ticks as the runtime comes up. */
export function GettingStartedView() {
  const { backend, platform, firstRunFinishingRefusal } = useTatolabWindowEnvironment();
  const status = useTatolabStatus();
  const [isGetStartedPending, setIsGetStartedPending] = useState(false);
  const gettingStarted = presentGettingStarted(status);
  const getStarted = () => {
    setIsGetStartedPending(true);
    firstRunFinishingRefusal.showRefusalReason(null);
    backend
      .rememberFirstRunFinished()
      .catch((rejection: unknown) => firstRunFinishingRefusal.showRefusalReason(describeBackendRejection(rejection)))
      .finally(() => setIsGetStartedPending(false));
  };
  return (
    <div className="flex h-screen flex-col bg-window text-fg">
      <div className="h-(--page-bar-height) shrink-0" data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined} />
      <main className="scrollbar-thin flex min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-[560px] max-w-full px-8 pt-[8vh] pb-10">
          <GettingSetUpScreen steps={gettingStarted.steps} />
        </div>
      </main>
      <footer className="shrink-0 border-t bg-chrome">
        <div className="mx-auto flex h-14 w-[560px] max-w-full items-center gap-2 px-8">
          <span className="text-xs text-fg-3" role="status">
            {gettingStarted.footerWords}
          </span>
          <div className="ml-auto">
            <ActionButton
              appearance="primary"
              isDisabled={!gettingStarted.getStartedIsOffered || isGetStartedPending}
              onPressed={getStarted}
              data-getting-started-action="get_started"
            >
              Get Started
            </ActionButton>
          </div>
        </div>
      </footer>
    </div>
  );
}
