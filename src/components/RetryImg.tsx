"use client";

import { useState } from "react";
import { retryUrl } from "@/lib/images";

/** <img> that quietly retries a couple of times (the image proxy can hit transient upstream drops) and fades in. */
export function RetryImg({
  src,
  srcSet,
  className = "",
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
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
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (attempt < 3) setTimeout(() => setAttempt((a) => a + 1), 800 * (attempt + 1));
      }}
      className={`${className} transition-[opacity,transform] duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
