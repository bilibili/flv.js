
Livestream playback
===================
You need to provide a livestream URL in `MediaDataSource` and indicates `isLive: true`.

Sample HTTP FLV source:

```js
{
    // HTTP FLV
    "type": "flv",
    "isLive": true,
    "url": "http://127.0.0.1:8080/live/livestream.flv"
}
```

Or a WebSocket source:

```js
{
    // FLV over WebSocket
    "type": "flv",
    "isLive": true,
    "url": "ws://127.0.0.1:9090/live/livestream.flv"
}
```

## HTTP FLV live stream

### CORS
You must configure `Access-Control-Allow-Origin` header correctly on your stream server.

See [cors.md](../docs/cors.md) for details.

### Compatibility
Due to IO restrictions, flv.js can support HTTP FLV live stream on `Chrome 43+`, `FireFox 42+`, `Edge 15.15048+` and `Safari 10.1+` for now.

HTTP FLV live stream relies on stream IO, which has been introduced in [fetch][] and [stream][] spec. Now `FetchStreamLoader` works well on most of the modern browsers:

- Chrome: `FetchStreamLoader` works well on Chrome 43+
- FireFox: FireFox has `fetch` support but `stream` is missing, `moz-chunked-arraybuffer` xhr extension is used
- Edge: `fetch + stream` is broken on old version of Microsoft Edge, see [Fetch API with ReadableStream has bug with data pumping][]. Got fixed in Creator Update (RS2).
- Safari: `FetchStreamLoader` works well since Safari 10.1 (macOS 10.12.4)

[fetch]: https://fetch.spec.whatwg.org/
[stream]: https://streams.spec.whatwg.org/
[Fetch API with ReadableStream has bug with data pumping]: https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8196907/
[Safari Technology Preview]: https://developer.apple.com/safari/technology-preview/
