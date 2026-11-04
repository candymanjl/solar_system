import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { BASE_PATH } from "@/lib/base-path";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  basepath: BASE_PATH,
  defaultErrorComponent: AppErrorComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
