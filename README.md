
flv.js
======
HTML5 Flash Video(FLV) Player, written in pure JavaScript without Flash. LONG LIVE FLV!

This project relies on [Media Source Extensions][].

### Overview
A JavaScript library which implements Flash Video(FLV) format playback in HTML5 video. It works by tramsmuxing FLV file stream into ISO BMFF (Fragmented MP4) segments,  then feed mp4 segments into browser through [Media Source Extensions][] API.

flv.js is written in [ECMAScript 6][], and transpiled into ECMAScript 5 by [Babel Compiler][], bundled with [Browserify][].

[Media Source Extensions]: https://w3c.github.io/media-source/
[ECMAScript 6]: https://github.com/lukehoban/es6features
[Babel Compiler]: https://babeljs.io/
[Browserify]: http://browserify.org/

### Features
- FLV container with H.264 + AAC codec playback
- Multipart video segments playback
- HTTP FLV live stream playback
- Compatible with Chrome, FireFox, IE11 and Edge
- Extermely low overhead, and hardware accelerated by your browser!

### Build
```bash
npm install          # install dev-dependences
npm install -g gulp  # install build tool
gulp release         # packaged & minimized js will be emitted in dist folder
```

[cnpm](https://github.com/cnpm/cnpm) is recommended if you are in Mainland China.

### Getting Started
```js
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