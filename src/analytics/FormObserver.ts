import { FIELD_SELECTOR } from "@/analytics/utils";

type RefreshHandler = () => void;

export class FormObserver {
  private observer: MutationObserver | null = null;
  private refreshHandler: RefreshHandler | null = null;
  private root: HTMLElement | null = null;

  start(root: HTMLElement, onRefresh: RefreshHandler) {
    this.stop();
    this.root = root;
    this.refreshHandler = onRefresh;

    if (typeof MutationObserver === "undefined") {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      const shouldRefresh = mutations.some((mutation) => {
        if (mutation.type === "childList") {
          return (
            hasFieldNode(mutation.addedNodes) || hasFieldNode(mutation.removedNodes)
          );
        }

        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "disabled" ||
            mutation.attributeName === "name" ||
            mutation.attributeName === "id" ||
            mutation.attributeName === "data-question-id")
        ) {
          return mutation.target instanceof HTMLElement;
        }

        return false;
      });

      if (shouldRefresh) {
        this.scheduleRefresh();
      }
    });

    this.observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "name", "id", "data-question-id", "class"],
    });
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.refreshHandler = null;
    this.root = null;
  }

  private scheduleRefresh() {
    const run = () => this.refreshHandler?.();

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 250 });
      return;
    }

    setTimeout(run, 0);
  }
}

function hasFieldNode(nodes: NodeList) {
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.matches(FIELD_SELECTOR) || node.querySelector(FIELD_SELECTOR)) {
      return true;
    }
  }
  return false;
}
