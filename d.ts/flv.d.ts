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

// flv.js TypeScript definition file

declare namespace FlvJs {

    interface MediaSegment {
        duration: number,
        filesize?: number,
        url: string
    }

    interface MediaDataSource {
        type: string,
        isLive?: boolean,
        cors?: boolean,
        withCredentials?: boolean,

        hasAudio?: boolean,
        hasVideo?: boolean,

        duration?: number;
        filesize?: number;
        url?: string;

        segments?: Array<MediaSegment>
    }

    interface Config {
        enableWorker?: boolean,
        enableStashBuffer?: boolean,
        stashInitialSize?: number,

        isLive?: boolean,

        lazyLoad?: boolean,
        lazyLoadMaxDuration?: number,
        lazyLoadRecoverDuration?: number,
        deferLoadAfterSourceOpen?: boolean,

        autoCleanupSourceBuffer?: boolean,
        autoCleanupMaxBackwardDuration?: number,
        autoCleanupMinBackwardDuration?: number,

        statisticsInfoReportInterval?: number,

        fixAudioTimestampGap?: boolean,

        accurateSeek?: boolean,
        seekType?: string,  // [range, param, custom]
        seekParamStart?: string,
        seekParamEnd?: string,
        rangeLoadZeroStart?: boolean,
        customSeekHandler?: any,
        reuseRedirectedURL?: boolean,
        referrerPolicy?: string

        customLoader?: CustomLoaderConstructor;
    }

    interface BaseLoaderConstructor {
        new(typeName: string): BaseLoader;
    }

    interface BaseLoader {
        protected _status: number;
        protected _needStash: boolean;

        constructor: BaseLoaderConstructor;
        destroy(): void;
        isWorking(): boolean;
        readonly type: string;
        readonly status: number;
        readonly needStashBuffer: boolean;
        onContentLengthKnown: Function;
        onURLRedirect: Function;
        onDataArrival: Function;
        onError: Function;
        onComplete: Function;
        abstract open(dataSource: MediaSegment, range: Range): void;
        abstract abort(): void;
    }

    interface CustomLoaderConstructor {
        new(seekHandler: any, config: Config): BaseLoader;
    }

    interface Range {
        from: number;
        to: number;
    }

    declare const LoaderStatus: {
        kIdle: 0,
        kConnecting: 1,
        kBuffering: 2,
        kError: 3,
        kComplete: 4
    };

    declare const LoaderErrors: {
        OK: 'OK',
        EXCEPTION: 'Exception',
        HTTP_STATUS_CODE_INVALID: 'HttpStatusCodeInvalid',
        CONNECTING_TIMEOUT: 'ConnectingTimeout',
        EARLY_EOF: 'EarlyEof',
        UNRECOVERABLE_EARLY_EOF: 'UnrecoverableEarlyEof'
    };

    interface FeatureList {
        mseFlvPlayback: boolean,
        mseLiveFlvPlayback: boolean,
        networkStreamIO: boolean,
        networkLoaderName: string,
        nativeMP4H264Playback: boolean,
        nativeWebmVP8Playback: boolean,
        nativeWebmVP9Playback: boolean
    }

    interface PlayerConstructor {
        new (mediaDataSource: MediaDataSource, config?: Config): Player;
    }

    interface Player {
        constructor: PlayerConstructor;
        destroy(): void;
        on(event: string, listener: Function): void;
        off(event: string, listener: Function): void;
        attachMediaElement(mediaElement: HTMLMediaElement): void;
        detachMediaElement(): void;
        load(): void;
        unload(): void;
        play(): Promise<void>;
        pause(): void;
        type: string;
        buffered: TimeRanges;
        duration: number;
        volume: number;
        muted: boolean;
        currentTime: number;
        mediaInfo: Object;
        statisticsInfo: Object;
    }

    interface FlvPlayer extends Player {
    }

    interface NativePlayer extends Player {
    }

    interface LoggingControl {
        forceGlobalTag: boolean;
        globalTag: string;
        enableAll: boolean;
        enableDebug: boolean;
        enableVerbose: boolean;
        enableInfo: boolean;
        enableWarn: boolean;
        enableError: boolean;
        getConfig(): Object;
        applyConfig(config: Object): void;
        addLogListener(listener: Function): void;
        removeLogListener(listener: Function): void;
    }

    interface Events {
        ERROR: string,
        LOADING_COMPLETE: string,
        RECOVERED_EARLY_EOF: string,
        MEDIA_INFO: string,
        METADATA_ARRIVED: string,
        STATISTICS_INFO: string
    }

    interface ErrorTypes {
        NETWORK_ERROR: string,
        MEDIA_ERROR: string,
        OTHER_ERROR: string
    }

    interface ErrorDetails {
        NETWORK_EXCEPTION: string,
        NETWORK_STATUS_CODE_INVALID: string,
        NETWORK_TIMEOUT: string,
        NETWORK_UNRECOVERABLE_EARLY_EOF: string,

        MEDIA_MSE_ERROR: string,

        MEDIA_FORMAT_ERROR: string,
        MEDIA_FORMAT_UNSUPPORTED: string,
        MEDIA_CODEC_UNSUPPORTED: string
    }

}

declare var flvjs: {
    createPlayer(mediaDataSource: FlvJs.MediaDataSource, config?: FlvJs.Config): FlvJs.Player,
    isSupported(): boolean,
    getFeatureList(): FlvJs.FeatureList,

    BaseLoader: FlvJs.BaseLoaderConstructor,
    LoaderStatus: FlvJs.LoaderStatus,
    LoaderErrors: FlvJS.LoaderErrors,

    Events: FlvJs.Events,
    ErrorTypes: FlvJs.ErrorTypes,
    ErrorDetails: FlvJs.ErrorDetails,

    FlvPlayer: FlvJs.PlayerConstructor,
    NativePlayer: FlvJs.PlayerConstructor,
    LoggingControl: FlvJs.LoggingControl
};

export default flvjs;
