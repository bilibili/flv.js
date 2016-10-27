
flv.js
======
HTML5 Flash Video(FLV) Player, written in pure JavaScript without Flash. LONG LIVE FLV!

This project relies on [Media Source Extensions][], and inspired by [hls.js][].

### Overview
A JavaScript library which implements Flash Video(FLV) format playback in HTML5 video. It works by transmuxing FLV file stream into ISO BMFF (Fragmented MP4) segments, then feed mp4 segments into browser through [Media Source Extensions][] API.

flv.js is written in [ECMAScript 6][], and transpiled into ECMAScript 5 by [Babel Compiler][], bundled with [Browserify][].

[Media Source Extensions]: https://w3c.github.io/media-source/
[hls.js]: https://github.com/dailymotion/hls.js
[ECMAScript 6]: https://github.com/lukehoban/es6features
[Babel Compiler]: https://babeljs.io/
[Browserify]: http://browserify.org/

### Features
- FLV container with H.264 + AAC codec playback
- Multipart segmented video playback
- HTTP FLV low latency live stream playback
- FLV over WebSocket live stream playback
- Compatible with Chrome, FireFox, Safari 10, IE11 and Edge
- Extermely low overhead, and hardware accelerated by your browser!

### Build
```bash
npm install          # install dev-dependences
npm install -g gulp  # install build tool
gulp release         # packaged & minimized js will be emitted in dist folder
```

[cnpm](https://github.com/cnpm/cnpm) mirror is recommended if you are in Mainland China.

### Getting Started
```html
<script src="flv.min.js"></script>
<video id="videoElement"></video>
<script>
    if (flvjs.isSupported()) {
        var videoElement = document.getElementById('videoElement');
        var flvPlayer = flvjs.createPlayer({
            type: 'flv',
            url: 'http://example.com/flv/video.flv'
        });
        flvPlayer.attachMediaElement(videoElement);
        flvPlayer.load();
        flvPlayer.play();
    }
</script>
```

### License
```
Copyright (C) 2016 Bilibili. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
