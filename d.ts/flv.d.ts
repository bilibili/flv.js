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
        duration: number;
        filesize?: number;
        url: string;
    }

    interface MediaDataSource {
        type: string;
        isLive?: boolean;
        cors?: boolean;
        withCredentials?: boolean;

        hasAudio?: boolean;
        hasVideo?: boolean;

        duration?: number;
        filesize?: number;
        url?: string;

        segments?: MediaSegment[];
    }

    interface Config {
        /**
         * @desc Enable separated thread for transmuxing (unstable for now)
         * @defaultvalue false
         */
        enableWorker?: boolean;
        /**
         * @desc Enable IO stash buffer. Set to false if you need realtime (minimal latency) for live stream
         *          playback, but may stalled if there's network jittering.
         * @defaultvalue true
         */
        enableStashBuffer?: boolean;
        /**
         * @desc Indicates IO stash buffer initial size. Default is `384KB`. Indicate a suitable size can
         *          improve video load/seek time.
         */
        stashInitialSize?: number;

        /**
         * @desc Same to `isLive` in **MediaDataSource**, ignored if has been set in MediaDataSource structure.
         * @defaultvalue false
         */
        isLive?: boolean;

        /**
         * @desc Abort the http connection if there's enough data for playback.
         * @defaultvalue true
         */
        lazyLoad?: boolean;
        /**
         * @desc Indicates how many seconds of data to be kept for `lazyLoad`.
         * @defaultvalue 3 * 60
         */
        lazyLoadMaxDuration?: number;
        /**
         * @desc Indicates the `lazyLoad` recover time boundary in seconds.
         * @defaultvalue 30
         */
        lazyLoadRecoverDuration?: number;
        /**
         * @desc Do load after MediaSource `sourceopen` event triggered. On Chrome, tabs which
         *          be opened in background may not trigger `sourceopen` event until switched to that tab.
         * @defaultvalue true
         */
        deferLoadAfterSourceOpen?: boolean;

        /**
         * @desc Do auto cleanup for SourceBuffer
         * @defaultvalue false (from docs)
         */
        autoCleanupSourceBuffer?: boolean;
        /**
         * @desc When backward buffer duration exceeded this value (in seconds), do auto cleanup for SourceBuffer
         * @defaultvalue 3 * 60
         */
        autoCleanupMaxBackwardDuration?: number;
        /**
         * @desc Indicates the duration in seconds to reserve for backward buffer when doing auto cleanup.
         * @defaultvalue 2 * 60
         */
        autoCleanupMinBackwardDuration?: number;

        /**
         * @defaultvalue 600
         */
        statisticsInfoReportInterval?: number;

        /**
         * @desc Fill silent audio frames to avoid a/v unsync when detect large audio timestamp gap.
         * @defaultvalue true
         */
        fixAudioTimestampGap?: boolean;

        /**
         * @desc Accurate seek to any frame, not limited to video IDR frame, but may a bit slower.
         *          Available on Chrome > 50, FireFox and Safari.
         * @defaultvalue false
         */
        accurateSeek?: boolean;
        /**
         * @desc 'range' use range request to seek, or 'param' add params into url to indicate request range.
         * @defaultvalue 'range'
         */
        seekType?: 'range' | 'param' | 'custom';
        /**
         * @desc Indicates seek start parameter name for seekType = 'param'
         * @defaultvalue 'bstart'
         */
        seekParamStart?: string;
        /**
         * @desc Indicates seek end parameter name for seekType = 'param'
         * @defaultvalue 'bend'
         */
        seekParamEnd?: string;
        /**
         * @desc Send Range: bytes=0- for first time load if use Range seek
         * @defaultvalue false
         */
        rangeLoadZeroStart?: boolean;
        /**
         * @desc Indicates a custom seek handler
         * @desc Should implement `SeekHandler` interface
         */
        customSeekHandler?: CustomSeekHandlerConstructor;
        /**
         * @desc Reuse 301/302 redirected url for subsequence request like seek, reconnect, etc.
         * @defaultvalue false
         */
        reuseRedirectedURL?: boolean;
        /**
         * @desc Indicates the Referrer Policy when using FetchStreamLoader
         * @defaultvalue 'no-referrer-when-downgrade' (from docs)
         */
        referrerPolicy?: ReferrerPolicy;
        /**
         * @desc Indicates additional headers that will be added to request
         */
        headers?: {
            [k: string]: string
        }
        /**
         * @desc Should implement `BaseLoader` interface
         */
        customLoader?: CustomLoaderConstructor;
    }

    interface CustomSeekHandlerConstructor {
        new(): SeekHandler;
    }

    interface SeekHandler {
        getConfig(sourceURL: string, range: Range): SeekConfig;
        removeURLParameters(url: string): string;
    }

    interface SeekConfig {
        url: string;
        headers: Headers | object;
    }

    interface BaseLoaderConstructor {
        new(typeName: string): BaseLoader;
    }

    interface BaseLoader {
        _status: number;
        _needStash: boolean;

        destroy(): void;
        isWorking(): boolean;
        readonly type: string;
        readonly status: number;
        readonly needStashBuffer: boolean;
        onContentLengthKnown: (contentLength: number) => void;
        onURLRedirect: (redirectedURL: string) => void;
        onDataArrival: (chunk: ArrayBuffer, byteStart: number, receivedLength?: number) => void;
        onError: (errorType: LoaderErrors, errorInfo: LoaderErrorMessage) => void;
        onComplete: (rangeFrom: number, rangeTo: number) => void;
        open(dataSource: MediaSegment, range: Range): void;
        abort(): void;
    }

    interface CustomLoaderConstructor {
        new(seekHandler: SeekHandler, config: Config): BaseLoader;
    }

    interface Range {
        from: number;
        to: number;
    }

    interface LoaderStatus {
        readonly kIdle: 0;
        readonly kConnecting: 1;
        readonly kBuffering: 2;
        readonly kError: 3;
        readonly kComplete: 4;
    }

    interface LoaderErrors {
        readonly OK: 'OK';
        readonly EXCEPTION: 'Exception';
        readonly HTTP_STATUS_CODE_INVALID: 'HttpStatusCodeInvalid';
        readonly CONNECTING_TIMEOUT: 'ConnectingTimeout';
        readonly EARLY_EOF: 'EarlyEof';
        readonly UNRECOVERABLE_EARLY_EOF: 'UnrecoverableEarlyEof';
    }

    interface LoaderErrorMessage {
        code: number;
        msg: string;
    }

    interface FeatureList {
        mseFlvPlayback: boolean;
        mseLiveFlvPlayback: boolean;
        networkStreamIO: boolean;
        networkLoaderName: string;
        nativeMP4H264Playback: boolean;
        nativeWebmVP8Playback: boolean;
        nativeWebmVP9Playback: boolean;
    }

    interface PlayerConstructor {
        new (mediaDataSource: MediaDataSource, config?: Config): Player;
    }

    interface Player {
        destroy(): void;
        on(event: string, listener: (...args: any[]) => void): void;
        off(event: string, listener: (...args: any[]) => void): void;
        attachMediaElement(mediaElement: HTMLMediaElement): void;
        detachMediaElement(): void;
        load(): void;
        unload(): void;
        play(): Promise<void> | void;
        pause(): void;
        type: string;
        buffered: TimeRanges;
        duration: number;
        volume: number;
        muted: boolean;
        currentTime: number;
        /**
         * @deprecated FlvPlayer/NativePlayer have its own `mediaInfo` field.
         * @desc Keep it for backwards compatibility
         * @since 1.4
         */
        mediaInfo: NativePlayerMediaInfo | FlvPlayerMediaInfo;
        /**
         * @deprecated FlvPlayer/NativePlayer have its own `statisticsInfo` field.
         * @desc Keep it for backwards compatibility
         * @since 1.4
         */
        statisticsInfo: NativePlayerStatisticsInfo | FlvPlayerStatisticsInfo;
    }

    interface NativePlayerStatisticsInfo {
        playerType: 'NativePlayer';
        url: string;
        decodedFrames?: number;
        droppedFrames?: number;
    }

    interface FlvPlayerReportStatisticsInfo {
        url: string;
        hasRedirect: boolean;
        redirectedURL?: string;
        speed: number; // KB/s
        loaderType: string;
        currentSegmentIndex: number;
        totalSegmentCount: number;
    }

    interface FlvPlayerStatisticsInfo extends Partial<FlvPlayerReportStatisticsInfo> {
        playerType: 'FlvPlayer';
        decodedFrames?: number;
        droppedFrames?: number;
    }

    interface NativePlayerMediaInfo {
        mimeType: string;
        duration?: number;
        width?: number;
        height?: number;
    }

    interface FlvPlayerMediaInfo extends NativePlayerMediaInfo {
        audioCodec?: string;
        videoCodec?: string;
        audioDataRate?: number;
        videoDataRate?: number;
        hasAudio?: boolean;
        hasVideo?: boolean;
        chromaFormat?: string;
        fps?: number;

        [k: string]: any;
    }

    interface FlvPlayer extends Player {
        mediaInfo: FlvPlayerMediaInfo;
        statisticsInfo: FlvPlayerStatisticsInfo;
    }

    interface NativePlayer extends Player {
        mediaInfo: NativePlayerMediaInfo;
        statisticsInfo: NativePlayerStatisticsInfo;
    }

    interface LoggingControlConfig {
        forceGlobalTag: boolean;
        globalTag: string;
        enableAll: boolean;
        enableDebug: boolean;
        enableVerbose: boolean;
        enableInfo: boolean;
        enableWarn: boolean;
        enableError: boolean;
    }

    interface LoggingControl extends LoggingControlConfig {
        getConfig(): LoggingControlConfig;
        applyConfig(config: Partial<LoggingControlConfig>): void;
        addLogListener(listener: (...args: any[]) => void): void;
        removeLogListener(listener: (...args: any[]) => void): void;
    }

    interface Events {
        ERROR: string;
        LOADING_COMPLETE: string;
        RECOVERED_EARLY_EOF: string;
        MEDIA_INFO: string;
        METADATA_ARRIVED: string;
        SCRIPTDATA_ARRIVED: string;
        STATISTICS_INFO: string;
    }

    interface ErrorTypes {
        NETWORK_ERROR: string;
        MEDIA_ERROR: string;
        OTHER_ERROR: string;
    }

    interface ErrorDetails {
        NETWORK_EXCEPTION: string;
        NETWORK_STATUS_CODE_INVALID: string;
        NETWORK_TIMEOUT: string;
        NETWORK_UNRECOVERABLE_EARLY_EOF: string;

        MEDIA_MSE_ERROR: string;

        MEDIA_FORMAT_ERROR: string;
        MEDIA_FORMAT_UNSUPPORTED: string;
        MEDIA_CODEC_UNSUPPORTED: string;
    }
}

declare var FlvJs: {
    createPlayer(mediaDataSource: FlvJs.MediaDataSource, config?: FlvJs.Config): FlvJs.Player;
    isSupported(): boolean;
    getFeatureList(): FlvJs.FeatureList;

    /**
     * @deprecated Use `FlvJs.BaseLoaderConstructor` instead.
     *              Because it's not available on `flvjs` variable.
     * @desc implement interface `BaseLoader`
     * @since 1.4
     */
    BaseLoader: FlvJs.BaseLoaderConstructor;
    /**
     * @deprecated Use `FlvJs.BaseLoaderConstructor` instead.
     *              Because it's not available on `flvjs` variable.
     * @since 1.4
     */
    LoaderStatus: FlvJs.LoaderStatus;
    /**
     * @deprecated Use `FlvJs.BaseLoaderConstructor` instead.
     *              Because it's not available on `flvjs` variable.
     * @since 1.4
     */
    LoaderErrors: FlvJs.LoaderErrors;

    readonly version: string;

    readonly Events: Readonly<FlvJs.Events>;
    readonly ErrorTypes: Readonly<FlvJs.ErrorTypes>;
    readonly ErrorDetails: Readonly<FlvJs.ErrorDetails>;

    readonly FlvPlayer: FlvJs.PlayerConstructor;
    readonly NativePlayer: FlvJs.PlayerConstructor;
    readonly LoggingControl: FlvJs.LoggingControl;
};

export default FlvJs;
