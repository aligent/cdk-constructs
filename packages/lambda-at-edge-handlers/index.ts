import { handler as PrerenderHandler } from "./lib/prerender";
import { handler as PrerenderCacheControlHandler } from "./lib/cache-control";
import { handler as PrerenderErrorResponseHandler } from "./lib/error-response";
import { handler as PrerenderCheckHandler } from "./lib/prerender-check";
import { handler as GeoIpRedirectHandler } from "./lib/redirect";

export {
  PrerenderHandler,
  PrerenderCacheControlHandler,
  PrerenderErrorResponseHandler,
  PrerenderCheckHandler,
  GeoIpRedirectHandler,
};
