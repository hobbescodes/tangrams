import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src="/tangrams-logo.png" alt="Tangrams" className="size-6" />
          <span className="font-bold leading-none -ml-4 -mb-1.5">angrams</span>
        </>
      ),
    },
    links: [
      {
        text: "GitHub",
        url: "https://github.com/hobbescodes/tangrams",
        external: true,
      },
    ],
  };
}
