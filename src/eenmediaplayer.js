/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Polyfill from './utils/polyfill.js';
import Features from './core/features.js';
import {BaseLoader, LoaderStatus, LoaderErrors} from './io/loader.js';
import FlvPlayer from './player/flv-player.js';
import NativePlayer from './player/native-player.js';
import PlayerEvents from './player/player-events.js';
import {ErrorTypes, ErrorDetails} from './player/player-errors.js';
import LoggingControl from './utils/logging-control.js';
import {InvalidArgumentException} from './utils/exception.js';

// here are all the interfaces

// install polyfills
Polyfill.install();




function startPlayback(config, element) {
    let start = config.start;
    let end = config.end;

    if (!start && !end) {
        start = 'stream_' + (new Date()).valueOf() + config.esn;
        end = '+300000';
    }

    let url = null;
    if (!config.url) {
        url =  [
            window.location.protocol + '//' + config.domain +
            '/asset/play/video.flv?' +
            'id=' + config.esn,
            'start_timestamp=' + start,
            'end_timestamp=' + end
        ].join('&');
    } else {
        url = config.url;
    }

    let keyframeMeta = null;
    if (config.keyframeData != null) {
        let times = [];
        let offsets = [];
        let header = config.keyframeData['header'];
        let headerSize = header['headersize'];
        let gopOffset = header['gopoffset'];
        let keyframes = config.keyframeData['keyframes'];

        for (let i = 0; i < keyframes.length; i++) {
            // array of fileindex, virtualts, virtual_offset
            let keyframe = keyframes[i];
            let ts = keyframe[2];
            let offset = 0;
            if (keyframe[0] === 0) {
                offset = keyframe[1] + headerSize - gopOffset;
            } else {
                offset = keyframe[1];
            }
            times.push(ts);
            offsets.push(offset);
        }
        keyframeMeta = {times: times, filepositions: offsets};

    } else {
        url += '&index=true';
    }

    if (config.auth_key != null) {
        url += '&A=' + config.auth_key;
    }

    let isLive = config.isLive();

    let options = {
        keyframes: keyframeMeta,
        enableWorker: false,
        lazyLoadMaxDuration: 5 * 60,
        seekType: 'range',
        url: url,
        isLive: isLive,
        enableStashBuffer: !isLive,
        type: 'flv'
    };

    if (config.options)
        Object.assign(config.options, options);

    let player = createPlayer(options, options);
    player.attachMediaElement(element);
    player.load();
    return player;
}

// factory method
function createPlayer(mediaDataSource, optionalConfig) {
    let mds = mediaDataSource;
    if (mds == null || typeof mds !== 'object') {
        throw new InvalidArgumentException('MediaDataSource must be an javascript object!');
    }

    if (!mds.hasOwnProperty('type')) {
        throw new InvalidArgumentException('MediaDataSource must has type field to indicate video file type!');
    }

    switch (mds.type) {
        case 'flv':
            return new FlvPlayer(mds, optionalConfig);
        default:
            return new NativePlayer(mds, optionalConfig);
    }
}


// feature detection
function isSupported() {
    return Features.supportMSEH264Playback();
}

function getFeatureList() {
    return Features.getFeatureList();
}


class MediaItem {
    constructor(esn) {
        this.keyframeData = null;
        this.esn = esn;
        this.start = null;
        this.end = null;
        this.auth_key = null;
        this.api_key = null;
        this.options = null;
        this.url = null;
        this.domain  = 'window.location.host'
    }

    setStartTime(time) {
        this.start = time;
    }

    setEndTime(time) {
        this.end = time;
    }

    setAPIKey(key) {
        this.api_key = key;
    }

    setAuthKey(key) {
        this.auth_key = key;
    }

    setOptions(options) {
        this.options = options;
    }

    setKeyframeData(data) {
        this.keyframeData = data;
    }

    setDomain(domain) {
        this.domain = domain
    }
    setUrl(url) {
        this.url = url;
    }

    isLive() {
        return this.start == null && this.end == null;
    }

}

// interfaces
let flvjs = {};

flvjs.createPlayer = createPlayer;
flvjs.isSupported = isSupported;
flvjs.getFeatureList = getFeatureList;

flvjs.BaseLoader = BaseLoader;
flvjs.LoaderStatus = LoaderStatus;
flvjs.LoaderErrors = LoaderErrors;

flvjs.Events = PlayerEvents;
flvjs.ErrorTypes = ErrorTypes;
flvjs.ErrorDetails = ErrorDetails;

flvjs.FlvPlayer = FlvPlayer;
flvjs.NativePlayer = NativePlayer;
flvjs.LoggingControl = LoggingControl;

Object.defineProperty(flvjs, 'version', {
    enumerable: true,
    get: function () {
        // replaced by browserify-versionify transform
        return '__VERSION__';
    }
});

let MediaPlayer = {};
let EEN = {};

MediaPlayer.startPlayback = startPlayback;
MediaPlayer.MediaItem = MediaItem;

EEN.MediaPlayer = MediaPlayer;
EEN.MediaPlayer.flvjs = flvjs;

export default EEN;

