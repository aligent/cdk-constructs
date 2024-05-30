import "source-map-support/register";
import { CloudFrontRequest, CloudFrontRequestEvent } from "aws-lambda";

const IS_BOT =
  /googlebot|bingbot|yandex|baiduspider|facebookexternalhit|facebookbot|twitterbot|linkedinbot|embedly|showyoubot|outbrain|pinterestbot|slackbot|vkShare|W3C_Validator|whatsapp|ImgProxy|flipboard|tumblr|bitlybot|skype|nuzzel|discordbot|google|qwantify|pinterest|lighthouse|telegrambo|Google-InspectionTool|Schema-Markup-Validator|SchemaBot|chrome-lighthouse|adsbot-google|Feedfetcher-Google|Facebot|rogerbot|quora link preview|SiteAuditBot|Storebot|Mediapartners-Google|AdIdxBot|BingPreview|Yahoo! Slurp|duckduckbot|applebot|gptbot|/i

const IS_FILE =
  /\.(js|css|xml|less|png|jpg|jpeg|gif|pdf|doc|txt|ico|rss|zip|mp3|rar|exe|wmv|avi|ppt|mpg|mpeg|tif|wav|mov|psd|ai|xls|mp4|m4a|swf|dat|dmg|iso|flv|m4v|woff|ttf|svg|webmanifest|eot|torrent)$/

// Allow passing a custom bot detection regex string
const IS_BOT_CUSTOM = new RegExp(process.env.CUSTOM_BOT_CHECK || '[]')

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequest> => {
  const request = event.Records[0].cf.request;

  // If the request is from a bot, is not a file and is not from prerender
  // then set the x-request-prerender header so the origin-request lambda function
  // alters the origin to prerender.io
  const userAgent = request.headers["user-agent"][0].value
  if (IS_BOT.test(userAgent) || IS_BOT_CUSTOM.test(userAgent)) {
    if (!IS_FILE.test(request.uri) && !request.headers["x-prerender"]) {
      request.headers["x-request-prerender"] = [
        {
          key: "x-request-prerender",
          value: "true",
        },
      ];

      request.headers["x-prerender-host"] = [
        { key: "X-Prerender-Host", value: request.headers.host[0].value },
      ];

      // Custom header to be forwarded to Prerender service for better logging
      request.headers["x-prerender-user-agent"] = [
        {
          key: "x-prerender-user-agent",
          value: request.headers["user-agent"][0].value,
        },
      ];
    }
  }

  return request;
};
