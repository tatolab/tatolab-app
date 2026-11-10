import type { ViewAskDone } from "@tatolab/tato-app-view-sdk";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { useCallback, useRef, useState } from "react";

/** What Studio said refusing a view's latest ask, after the view's words naming what was asked. */
export interface RefusalOfTheLatestAsk {
  lead: string;
  because: string;
}

/** The refusal of the latest ask a view sent through `showTheRefusalOf`, or `null` once a later one is done; an earlier ask answering late changes nothing. */
export function useRefusalOfTheLatestAsk(): [RefusalOfTheLatestAsk | null, (lead: string, asked: Promise<ViewAskDone>) => void] {
  const [refusal, setRefusal] = useState<RefusalOfTheLatestAsk | null>(null);
  const latestAskNumber = useRef(0);
  const showTheRefusalOf = useCallback((lead: string, asked: Promise<ViewAskDone>) => {
    latestAskNumber.current += 1;
    const askNumber = latestAskNumber.current;
    void asked.then((answer) => {
      if (askNumber !== latestAskNumber.current) return;
      setRefusal(answer.kind === "refused" ? { lead, because: answer.because } : null);
    });
  }, []);
  return [refusal, showTheRefusalOf];
}

/** The bar across the top of a core view saying, in Studio's words, why its latest ask was refused. */
export function RefusalOfTheLatestAskBar({ refusal }: { refusal: RefusalOfTheLatestAsk | null }) {
  if (refusal === null) return null;
  return <RefusalLine layout="bar" lead={refusal.lead} words={refusal.because} />;
}
