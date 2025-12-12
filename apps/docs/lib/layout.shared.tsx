import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <span className="font-bold">Tangrams</span>,
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
