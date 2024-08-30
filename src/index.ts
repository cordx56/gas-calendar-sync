import { sync, init } from "@/main";

declare const global: {
  [x: string]: any;
};

global.sync = sync;
global.init = init;
