
CORS Configuration
==================
Anytime you want to play an FLV stream from another `Origin`, the server must response with a CORS header:

```
Access-Control-Allow-Origin: <your-origin> | *
```

For example, if an html on your site `http://flvplayback.com` want's to play an FLV from another `Origin` like `http://cdn.flvplayback.com`, the video server must response with the following CORS header:

```
Access-Control-Allow-Origin: http://flvplayback.com
```

Or a wildcard value `*` to allow any request origin:

```
Access-Control-Allow-Origin: *
```

## Static FLV file playback
For static FLV file playback, we recommend you to add:

```
Access-Control-Expose-Headers: Content-Length
```

Or you should provide accurate filesize in **MediaDataSource** object.

## CORS with 301/302 redirect
If your video server response with a 3xx redirection, the redirection's response headers **must** contains `Access-Control-Allow-Origin`;

Obviously the redirect target server should also response with CORS headers, but pay attention that the browser will send `Origin: null` in redirected request according to current CORS policy.

It means that your actual edge server should response with:

```
Access-Control-Allow-Origin: null | *
```

Or you can determine by request header `Origin` dynamically.

## Preflight OPTIONS for Range seek
When use Range seek for cross-origin FLV file, `Range` header added by flv.js will cause a [Preflight OPTIONS][] request by the browser.

The browser will send an `OPTIONS` request before actual `GET` request, with following additional headers according to CORS policy:

```
Access-Control-Request-Headers: range
Access-Control-Request-Method: GET
```

This means your video server must response to OPTIONS request with following additional CORS headers:

```
Access-Control-Allow-Origin: <your-origin> | *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: range
```

[Preflight OPTIONS]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS#Preflighted_requests

## Reference
We strongly advise you to read [HTTP access control (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS) document carefully.
