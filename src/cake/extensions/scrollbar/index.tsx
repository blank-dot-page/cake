import { useCallback, useEffect, useRef, useState } from "react";
import type { CakeEditorUI, CakeExtension } from "../../core/runtime";

type ScrollState = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

const THUMB_MIN_HEIGHT = 30;
const SCROLL_HIDE_DELAY = 500;
const TRACK_PADDING = 8;

function ScrollbarOverlay({ container }: { container: HTMLElement }) {
  const [state, setState] = useState<ScrollState>({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const dragStartRef = useRef<{ scrollTop: number; clientY: number } | null>(
    null,
  );
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { scrollTop, scrollHeight, clientHeight } = state;
  const hasOverflow = scrollHeight > clientHeight;
  const trackHeight = clientHeight - TRACK_PADDING * 2;

  const rawThumbHeight = hasOverflow
    ? (clientHeight / scrollHeight) * trackHeight
    : 0;
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(THUMB_MIN_HEIGHT, rawThumbHeight),
  );

  const maxScrollTop = scrollHeight - clientHeight;
  const thumbTop =
    maxScrollTop > 0
      ? TRACK_PADDING + (scrollTop / maxScrollTop) * (trackHeight - thumbHeight)
      : TRACK_PADDING;

  useEffect(() => {
    function checkDarkMode() {
      // Check for explicit dark class - blank page adds "dark" class when in dark mode
      // When in light mode, there's no explicit class, so default to light
      const html = document.documentElement;
      setIsDarkMode(html.classList.contains("dark"));
    }

    checkDarkMode();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", checkDarkMode);

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      mediaQuery.removeEventListener("change", checkDarkMode);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    function update() {
      setState({
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
    }

    function handleScroll() {
      update();
      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, SCROLL_HIDE_DELAY);
    }

    update();
    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", update);

    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let observedContent: Element | null = null;

    const observeContent = () => {
      if (!resizeObserver) {
        return;
      }
      const nextContent = container.querySelector(".cake-content");
      if (nextContent === observedContent) {
        return;
      }
      if (observedContent) {
        resizeObserver.unobserve(observedContent);
      }
      observedContent = nextContent;
      if (observedContent) {
        resizeObserver.observe(observedContent);
      }
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(container);
      observeContent();
    }

    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        observeContent();
        update();
      });
      mutationObserver.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [container]);

  const handleTrackClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const trackRect = event.currentTarget.getBoundingClientRect();
      const clickY = event.clientY - trackRect.top;
      const clickRatio = clickY / trackHeight;
      const targetScrollTop = clickRatio * maxScrollTop;
      container.scrollTop = Math.max(
        0,
        Math.min(targetScrollTop, maxScrollTop),
      );
    },
    [container, trackHeight, maxScrollTop],
  );

  const handleThumbMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = {
        scrollTop: container.scrollTop,
        clientY: event.clientY,
      };
    },
    [container],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const originalUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    function handleMouseMove(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
      if (!dragStartRef.current) {
        return;
      }
      const deltaY = event.clientY - dragStartRef.current.clientY;
      const scrollableTrack = trackHeight - thumbHeight;
      const scrollRatio = scrollableTrack > 0 ? deltaY / scrollableTrack : 0;
      const deltaScroll = scrollRatio * maxScrollTop;
      container.scrollTop = Math.max(
        0,
        Math.min(dragStartRef.current.scrollTop + deltaScroll, maxScrollTop),
      );
    }

    function handleMouseUp(event: MouseEvent) {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      dragStartRef.current = null;
    }

    document.addEventListener("mousemove", handleMouseMove, { capture: true });
    document.addEventListener("mouseup", handleMouseUp, { capture: true });
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, {
        capture: true,
      });
      document.removeEventListener("mouseup", handleMouseUp, {
        capture: true,
      });
      document.body.style.userSelect = originalUserSelect;
    };
  }, [isDragging, container, trackHeight, thumbHeight, maxScrollTop]);

  if (!hasOverflow || trackHeight < THUMB_MIN_HEIGHT) {
    return null;
  }

  const isVisible = isDragging || isHovered || isScrolling;

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: 50,
  };

  const trackStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "12px",
    height: clientHeight,
    pointerEvents: "auto",
  };

  const getThumbColor = () => {
    if (isDarkMode) {
      return isDragging
        ? "rgba(255, 255, 255, 0.5)"
        : "rgba(255, 255, 255, 0.3)";
    }
    return isDragging ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.3)";
  };

  const thumbStyle: React.CSSProperties = {
    position: "absolute",
    right: "2px",
    width: "6px",
    borderRadius: "9999px",
    height: thumbHeight,
    top: thumbTop,
    opacity: isVisible ? 1 : 0,
    backgroundColor: getThumbColor(),
    transition: "opacity 150ms",
    cursor: "pointer",
  };

  return (
    <div style={wrapperStyle}>
      <div
        data-testid="custom-scrollbar"
        aria-hidden="true"
        style={trackStyle}
        onClick={handleTrackClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          data-testid="scrollbar-thumb"
          style={thumbStyle}
          onMouseDown={handleThumbMouseDown}
        />
      </div>
    </div>
  );
}

function ScrollbarUI({ editor }: { editor: CakeEditorUI }) {
  return <ScrollbarOverlay container={editor.getContainer()} />;
}

export const scrollbarExtension: CakeExtension = (host) => {
  const unmount = host.registerUI(ScrollbarUI);
  return () => unmount();
};
