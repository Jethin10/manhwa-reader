"use client";

import { useEffect, useRef, useState } from "react";
import { retryUrl } from "@/lib/images";

/** <img> that quietly retries a couple of times (the image proxy can hit transient upstream drops) and fades in. */
export function RetryImg(
  props: React.ImgHTMLAttributes<HTMLImageElement> & { src: string },
) {
  return <RetryImage key={props.src} {...props} />;
}

function RetryImage({
  src,
  srcSet,
  className = "",
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const retrying = attempt > 0;
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...rest}
      src={retrying ? retryUrl(src, attempt) : src}
      srcSet={retrying ? undefined : srcSet}
      ref={(el) => {
        // Covers SSR'd images that finished loading before hydration attached onLoad
        if (el?.complete && el.naturalWidth) setLoaded(true);
      }}
      onLoad={(event) => {
        clearTimeout(timer.current);
        timer.current = undefined;
        setLoaded(true);
        rest.onLoad?.(event);
      }}
      onError={(event) => {
        rest.onError?.(event);
        if (attempt < 3 && timer.current === undefined)
          timer.current = setTimeout(
            () => {
              timer.current = undefined;
              setAttempt((a) => a + 1);
            },
            800 * (attempt + 1),
          );
      }}
      className={`${className} transition-[opacity,transform] duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
