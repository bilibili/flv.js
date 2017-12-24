
Multipart playback
==================
When you create FlvPlayer instance, the `MediaDataSource` structure is passing through the constructor.

You need to provide a playlist for `MediaDataSource` in following format:

```js
{
    // Required
    "type": "flv",  // Only flv type supports multipart playback

    // Optional
    "duration": 12345678,  // total duration, in milliseconds
    "cors": true,
    "withCredentials": false,

    // Optional
    // true by default, do not indicate unless you have to deal with audio-only or video-only stream
    "hasAudio": true,
    "hasVideo": true,

    // Required
    "segments": [
        {
            "duration": 1234,  // in milliseconds
            "filesize": 5678,  // in bytes
            "url": "http://cdn.flvplayback.com/segments-1.flv"
        },
        {
            "duration": 2345,
            "filesize": 6789,
            "url": "http://cdn.flvplayback.com/segments-2.flv"
        },
        {
            "duration": 4567,
            "filesize": 7890,
            "url": "http://cdn.flvplayback.com/segments-3.flv"
        }
        // more segments...
    ]
}
```

You must provide **accurate** duration for each segment.

## Sample input
```json
{
    "type": "flv",
    "duration": 1373161,
    "segments": [
        {
            "duration": 333438,
            "filesize": 60369190,
            "url": "http://127.0.0.1/flv/7182741-1.flv"
        },{
            "duration": 390828,
            "filesize": 75726439,
            "url": "http://127.0.0.1/flv/7182741-2.flv"
        },{
            "duration": 434453,
            "filesize": 103453988,
            "url": "http://127.0.0.1/flv/7182741-3.flv"
        },{
            "duration": 214442,
            "filesize": 44189200,
            "url": "http://127.0.0.1/flv/7182741-4.flv"
        }
    ]
}
```
